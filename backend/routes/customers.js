const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// @route   GET /api/customers/profile
// @desc    Get customer profile
// @access  Private
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('customerID', sql.Int, req.user.customerID)
            .query(`
                SELECT 
                    CustomerID,
                    FirstName,
                    LastName,
                    Email,
                    Phone,
                    Address,
                    DateCreated,
                    IsActive
                FROM Customers
                WHERE CustomerID = @customerID
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Customer not found' 
            });
        }

        res.json({
            success: true,
            customer: result.recordset[0]
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching profile' 
        });
    }
});

// @route   PUT /api/customers/profile
// @desc    Update customer profile
// @access  Private
router.put('/profile', authMiddleware, async (req, res) => {
    try {
        const { firstName, lastName, phone, address } = req.body;

        const pool = await getPool();

        const result = await pool.request()
            .input('customerID', sql.Int, req.user.customerID)
            .input('firstName', sql.VarChar, firstName)
            .input('lastName', sql.VarChar, lastName)
            .input('phone', sql.VarChar, phone || null)
            .input('address', sql.VarChar, address || null)
            .query(`
                UPDATE Customers
                SET 
                    FirstName = @firstName,
                    LastName = @lastName,
                    Phone = @phone,
                    Address = @address
                OUTPUT INSERTED.CustomerID, INSERTED.FirstName, INSERTED.LastName, 
                       INSERTED.Email, INSERTED.Phone, INSERTED.Address
                WHERE CustomerID = @customerID
            `);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            customer: result.recordset[0]
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating profile' 
        });
    }
});

// @route   GET /api/customers/dashboard
// @desc    Get customer dashboard data (accounts, recent transactions, loans summary)
// @access  Private
router.get('/dashboard', authMiddleware, async (req, res) => {
    try {
        const pool = await getPool();

        // Get all accounts
        const accountsResult = await pool.request()
            .input('customerID', sql.Int, req.user.customerID)
            .query(`
                SELECT 
                    AccountID,
                    AccountNumber,
                    AccountType,
                    Balance,
                    DateOpened,
                    IsActive
                FROM Accounts
                WHERE CustomerID = @customerID AND IsActive = 1
            `);

        // Get total balance
        const totalBalance = accountsResult.recordset.reduce(
            (sum, account) => sum + parseFloat(account.Balance), 
            0
        );

        // Get recent transactions
        const transactionsResult = await pool.request()
            .input('customerID', sql.Int, req.user.customerID)
            .query(`
                SELECT TOP 10
                    T.TransactionID,
                    FA.AccountNumber AS FromAccount,
                    TA.AccountNumber AS ToAccount,
                    T.TransactionType,
                    T.Amount,
                    T.TransactionDate
                FROM Transactions T
                LEFT JOIN Accounts FA ON T.FromAccountID = FA.AccountID
                LEFT JOIN Accounts TA ON T.ToAccountID = TA.AccountID
                WHERE FA.CustomerID = @customerID OR TA.CustomerID = @customerID
                ORDER BY T.TransactionDate DESC
            `);

        // Get loans summary
        const loansResult = await pool.request()
            .input('customerID', sql.Int, req.user.customerID)
            .query(`
                SELECT 
                    COUNT(*) AS TotalLoans,
                    ISNULL(SUM(L.LoanAmount), 0) AS TotalBorrowed,
                    ISNULL(SUM(R.AmountPaid), 0) AS TotalRepaid,
                    ISNULL(SUM(L.LoanAmount), 0) - ISNULL(SUM(R.AmountPaid), 0) AS TotalOutstanding
                FROM Loans L
                LEFT JOIN (
                    SELECT LoanID, SUM(AmountPaid) AS AmountPaid
                    FROM LoanRepayments
                    GROUP BY LoanID
                ) R ON L.LoanID = R.LoanID
                WHERE L.CustomerID = @customerID
            `);

        res.json({
            success: true,
            dashboard: {
                accounts: accountsResult.recordset,
                totalBalance: parseFloat(totalBalance.toFixed(2)),
                recentTransactions: transactionsResult.recordset,
                loansSummary: loansResult.recordset[0] || {
                    TotalLoans: 0,
                    TotalBorrowed: 0,
                    TotalRepaid: 0,
                    TotalOutstanding: 0
                }
            }
        });

    } catch (error) {
        console.error('Get dashboard error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching dashboard data' 
        });
    }
});

module.exports = router;