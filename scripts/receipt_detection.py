from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import cv2
import json
import base64
import numpy as np
from ultralytics import YOLO
import datetime
import csv
import os
from typing import List, Dict, Any

app = FastAPI()

# Enable CORS for React app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load your fine-tuned model
try:
    fine_tuned_model = YOLO('runs/detect/yolov8n_playing_cards2/weights/best.pt')
    print("Model loaded successfully!")
    print("Model classes:", fine_tuned_model.names)
except Exception as e:
    print(f"Error loading model: {e}")
    fine_tuned_model = None

card_suits = {'h': 'Hearts', 'd': 'Diamonds', 'c': 'Clubs', 's': 'Spades'}
card_ranks = {'A': 'Ace', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', 
              '7': '7', '8': '8', '9': '9', '10': '10', 'J': 'Jack', 'Q': 'Queen', 'K': 'King'}

# Request model for image detection
class ImageDetectionRequest(BaseModel):
    image: str  # base64 encoded image
    timestamp: str = None

# Response models
class DetectedCard(BaseModel):
    label: str
    rank: str
    suit: str
    confidence: float
    bbox: List[float] = None  # [x1, y1, x2, y2]

class DetectionResponse(BaseModel):
    cards: List[DetectedCard]
    processed_at: str
    image_size: List[int] = None  # [width, height]
    processing_time: float = None

def format_card_info(label: str) -> tuple:
    """Extract rank and suit from label"""
    if len(label) >= 2:
        if label.startswith("10"):
            rank = '10'
            suit = label[2] if len(label) > 2 else ''
        else:
            rank = label[0]
            suit = label[1] if len(label) > 1 else ''
        
        rank_name = card_ranks.get(rank, rank)
        suit_name = card_suits.get(suit, suit)
        
        return rank_name, suit_name
    
    return label, ""

def save_to_csv(cards: List[DetectedCard], timestamp: str = None):
    """Save detection results to CSV file"""
    if not cards:
        return
    
    if timestamp is None:
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    
    csv_file = 'card_detections.csv'
    file_exists = os.path.isfile(csv_file)
    
    try:
        with open(csv_file, mode='a', newline='') as file:
            writer = csv.writer(file)
            
            # Write header if file is new
            if not file_exists:
                writer.writerow(['Timestamp', 'Card_Label', 'Rank', 'Suit', 'Confidence', 'BBox'])
            
            # Write detection data
            for card in cards:
                bbox_str = f"[{','.join(map(str, card.bbox))}]" if card.bbox else ""
                writer.writerow([
                    timestamp, 
                    card.label, 
                    card.rank, 
                    card.suit, 
                    f"{card.confidence:.2f}%",
                    bbox_str
                ])
        print(f"Saved {len(cards)} detections to {csv_file}")
    except Exception as e:
        print(f"Error saving to CSV: {e}")

@app.post("/detect-image", response_model=DetectionResponse)
async def detect_cards_in_image(request: ImageDetectionRequest):
    """
    Detect playing cards in a single image
    """
    if fine_tuned_model is None:
        raise HTTPException(status_code=500, detail="Model not loaded")
    
    start_time = datetime.datetime.now()
    
    try:
        # Decode base64 image
        if ',' in request.image:
            image_data = base64.b64decode(request.image.split(',')[1])
        else:
            image_data = base64.b64decode(request.image)
        
        nparr = np.frombuffer(image_data, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            raise HTTPException(status_code=400, detail="Could not decode image")
        
        print(f"Processing image: {frame.shape}")
        
        # Run detection
        results = fine_tuned_model(frame, conf=0.25)  # Lower confidence threshold for better detection
        detected_cards = []
        
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                print(f"Found {len(boxes)} detections")
                
                for box in boxes:
                    classification = box.cls
                    confidence = box.conf.item()
                    label = fine_tuned_model.names[int(classification.item())]
                    
                    # Get bounding box coordinates
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                    bbox = [float(x1), float(y1), float(x2), float(y2)]
                    
                    print(f"Detection: {label} - Confidence: {confidence:.3f}")
                    
                    if confidence >= 0.3:  # Confidence threshold
                        rank_name, suit_name = format_card_info(label)
                        
                        detected_card = DetectedCard(
                            label=label,
                            rank=rank_name,
                            suit=suit_name,
                            confidence=round(confidence * 100, 2),
                            bbox=bbox
                        )
                        detected_cards.append(detected_card)
        
        # Remove duplicate detections (same card detected multiple times)
        unique_cards = []
        seen_labels = set()
        
        for card in detected_cards:
            if card.label not in seen_labels:
                unique_cards.append(card)
                seen_labels.add(card.label)
            else:
                # If duplicate, keep the one with higher confidence
                for i, existing_card in enumerate(unique_cards):
                    if existing_card.label == card.label and card.confidence > existing_card.confidence:
                        unique_cards[i] = card
                        break
        
        # Sort by confidence (highest first)
        unique_cards.sort(key=lambda x: x.confidence, reverse=True)
        
        # Save to CSV
        timestamp = request.timestamp or datetime.datetime.now().isoformat()
        save_to_csv(unique_cards, timestamp)
        
        # Calculate processing time
        processing_time = (datetime.datetime.now() - start_time).total_seconds()
        
        response = DetectionResponse(
            cards=unique_cards,
            processed_at=datetime.datetime.now().isoformat(),
            image_size=[frame.shape[1], frame.shape[0]],  # [width, height]
            processing_time=round(processing_time, 3)
        )
        
        print(f"Returning {len(unique_cards)} unique cards, processing took {processing_time:.3f}s")
        return response
        
    except Exception as e:
        print(f"Error processing image: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")

@app.get("/")
async def root():
    return {
        "message": "Card Detection API is running",
        "model_loaded": fine_tuned_model is not None,
        "endpoints": ["/detect-image", "/test-model", "/health"]
    }

@app.get("/test-model")
async def test_model():
    """Test endpoint to verify model is loaded and working"""
    if fine_tuned_model is None:
        return {"status": "Error", "error": "Model not loaded"}
    
    try:
        # Create a test image
        test_image = np.zeros((480, 640, 3), dtype=np.uint8)
        results = fine_tuned_model(test_image)
        
        return {
            "status": "Model loaded successfully", 
            "classes": fine_tuned_model.names,
            "num_classes": len(fine_tuned_model.names)
        }
    except Exception as e:
        return {"status": "Error", "error": str(e)}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.datetime.now().isoformat(),
        "model_status": "loaded" if fine_tuned_model is not None else "error"
    }

@app.get("/stats")
async def get_detection_stats():
    """Get statistics about detections"""
    csv_file = 'card_detections.csv'
    
    if not os.path.isfile(csv_file):
        return {"total_detections": 0, "unique_cards": 0, "recent_detections": []}
    
    try:
        with open(csv_file, 'r') as file:
            reader = csv.DictReader(file)
            rows = list(reader)
            
        total_detections = len(rows)
        unique_cards = len(set(row['Card_Label'] for row in rows))
        recent_detections = rows[-10:] if rows else []  # Last 10 detections
        
        return {
            "total_detections": total_detections,
            "unique_cards": unique_cards,
            "recent_detections": recent_detections
        }
    except Exception as e:
        return {"error": f"Could not read stats: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    print("Starting Card Detection Backend (Image Capture Mode)...")
    if fine_tuned_model:
        print("Model classes:", fine_tuned_model.names)
    else:
        print("WARNING: Model failed to load!")
    uvicorn.run(app, host="0.0.0.0", port=8000)