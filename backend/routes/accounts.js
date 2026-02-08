const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// @route   GET /api/accounts
// @desc    Get all accounts for logged-in customer
// @access  Private
router.get('/', authMiddleware, async (req, res) => {
    try {
        const pool = await getPool();
        
        const result = await pool.request()
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

        res.json({
            success: true,
            accounts: result.recordset
        });

    } catch (error) {
        console.error('Get accounts error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching accounts' 
        });
    }
});

// @route   GET /api/accounts/:accountNumber/balance
// @desc    Get account balance
// @access  Private
router.get('/:accountNumber/balance', authMiddleware, async (req, res) => {
    try {
        const pool = await getPool();
        
        const result = await pool.request()
            .input('accountNumber', sql.VarChar, req.params.accountNumber)
            .input('customerID', sql.Int, req.user.customerID)
            .query(`
                SELECT Balance, AccountType
                FROM Accounts
                WHERE AccountNumber = @accountNumber 
                AND CustomerID = @customerID
                AND IsActive = 1
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Account not found' 
            });
        }

        res.json({
            success: true,
            balance: result.recordset[0].Balance,
            accountType: result.recordset[0].AccountType
        });

    } catch (error) {
        console.error('Get balance error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching balance' 
        });
    }
});

// @route   POST /api/accounts
// @desc    Open new account
// @access  Private
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { accountType, initialDeposit } = req.body;

        if (!['Savings', 'Current'].includes(accountType)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid account type. Must be Savings or Current' 
            });
        }

        const pool = await getPool();

        // Generate unique account number
        const accountNumber = 'ACC' + Date.now() + Math.floor(Math.random() * 10000);

        await pool.request()
            .input('CustomerID', sql.Int, req.user.customerID)
            .input('AccountNumber', sql.VarChar, accountNumber)
            .input('AccountType', sql.VarChar, accountType)
            .input('InitialDeposit', sql.Decimal(15, 2), initialDeposit || 0)
            .execute('sp_OpenAccount');

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            accountNumber,
            accountType,
            balance: initialDeposit || 0
        });

    } catch (error) {
        console.error('Create account error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error creating account' 
        });
    }
});

module.exports = router;