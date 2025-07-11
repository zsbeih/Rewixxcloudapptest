package com.warehouse.entity.tender;

import com.warehouse.entity.customer.Customer;
import com.warehouse.entity.sale.Sale;
import com.warehouse.entity.supplier.Supplier;

import javax.persistence.*;
import java.math.BigDecimal;

/**
 * Tender entity - represents financial transactions
 */
@Entity
@Table(name = "tenders")
public class Tender {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Transaction amount
     * Negative for expenses, positive for income
     */
    @Column(precision = 19, scale = 2)
    private BigDecimal amount;

    /**
     * Type of tender (e.g., "INCOME", "EXPENSE")
     */
    private String type;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sale_id")
    private Sale sale;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "currency_id")
    private Currency currency;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    private Customer customer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "supplier_id")
    private Supplier supplier;

    // Constructors
    public Tender() {}

    public Tender(BigDecimal amount, String type, Currency currency) {
        this.amount = amount;
        this.type = type;
        this.currency = currency;
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public Sale getSale() {
        return sale;
    }

    public void setSale(Sale sale) {
        this.sale = sale;
    }

    public Currency getCurrency() {
        return currency;
    }

    public void setCurrency(Currency currency) {
        this.currency = currency;
    }

    public Customer getCustomer() {
        return customer;
    }

    public void setCustomer(Customer customer) {
        this.customer = customer;
    }

    public Supplier getSupplier() {
        return supplier;
    }

    public void setSupplier(Supplier supplier) {
        this.supplier = supplier;
    }

    // Business methods
    public boolean isIncome() {
        return amount != null && amount.compareTo(BigDecimal.ZERO) > 0;
    }

    public boolean isExpense() {
        return amount != null && amount.compareTo(BigDecimal.ZERO) < 0;
    }

    // Equals and HashCode
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Tender tender = (Tender) o;
        return Objects.equals(id, tender.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    @Override
    public String toString() {
        return "Tender{" +
                "id=" + id +
                ", amount=" + amount +
                ", type='" + type + '\'' +
                ", currency=" + (currency != null ? currency.getCode() : "null") +
                '}';
    }
}