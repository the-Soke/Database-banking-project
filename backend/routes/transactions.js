const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// @route   POST /api/transactions/deposit
// @desc    Deposit money
// @access  Private
router.post('/deposit', authMiddleware, async (req, res) => {
    try {
        const { accountNumber, amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Amount must be greater than 0' 
            });
        }

        const pool = await getPool();

        // Verify account belongs to customer
        const accountCheck = await pool.request()
            .input('AccountNumber', sql.VarChar, accountNumber)
            .input('CustomerID', sql.Int, req.user.customerID)
            .query(`
                SELECT AccountID, Balance 
                FROM Accounts 
                WHERE AccountNumber = @AccountNumber 
                AND CustomerID = @CustomerID
                AND IsActive = 1
            `);

        if (accountCheck.recordset.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Account not found or access denied' 
            });
        }

        // Execute deposit procedure
        await pool.request()
            .input('AccountNumber', sql.VarChar, accountNumber)
            .input('Amount', sql.Decimal(15, 2), amount)
            .execute('sp_DepositMoney');

        // Get updated balance
        const balanceResult = await pool.request()
            .input('AccountNumber', sql.VarChar, accountNumber)
            .query('SELECT Balance FROM Accounts WHERE AccountNumber = @AccountNumber');

        res.json({
            success: true,
            message: 'Deposit successful',
            newBalance: balanceResult.recordset[0].Balance
        });

    } catch (error) {
        console.error('Deposit error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error processing deposit' 
        });
    }
});

// @route   POST /api/transactions/withdraw
// @desc    Withdraw money
// @access  Private
router.post('/withdraw', authMiddleware, async (req, res) => {
    try {
        const { accountNumber, amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Amount must be greater than 0' 
            });
        }

        const pool = await getPool();

        // Verify account belongs to customer
        const accountCheck = await pool.request()
            .input('AccountNumber', sql.VarChar, accountNumber)
            .input('CustomerID', sql.Int, req.user.customerID)
            .query(`
                SELECT AccountID, Balance 
                FROM Accounts 
                WHERE AccountNumber = @AccountNumber 
                AND CustomerID = @CustomerID
                AND IsActive = 1
            `);

        if (accountCheck.recordset.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Account not found or access denied' 
            });
        }

        // Execute withdrawal procedure
        await pool.request()
            .input('AccountNumber', sql.VarChar, accountNumber)
            .input('Amount', sql.Decimal(15, 2), amount)
            .execute('sp_WithdrawMoney');

        // Get updated balance
        const balanceResult = await pool.request()
            .input('AccountNumber', sql.VarChar, accountNumber)
            .query('SELECT Balance FROM Accounts WHERE AccountNumber = @AccountNumber');

        res.json({
            success: true,
            message: 'Withdrawal successful',
            newBalance: balanceResult.recordset[0].Balance
        });

    } catch (error) {
        console.error('Withdrawal error:', error);
        
        if (error.message && error.message.includes('Insufficient funds')) {
            return res.status(400).json({ 
                success: false, 
                message: 'Insufficient funds' 
            });
        }

        res.status(500).json({ 
            success: false, 
            message: 'Error processing withdrawal' 
        });
    }
});

// @route   POST /api/transactions/transfer
// @desc    Transfer money between accounts
// @access  Private
router.post('/transfer', authMiddleware, async (req, res) => {
    try {
        const { fromAccountNumber, toAccountNumber, amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Amount must be greater than 0' 
            });
        }

        const pool = await getPool();

        // Verify source account belongs to customer
        const accountCheck = await pool.request()
            .input('AccountNumber', sql.VarChar, fromAccountNumber)
            .input('CustomerID', sql.Int, req.user.customerID)
            .query(`
                SELECT AccountID, Balance 
                FROM Accounts 
                WHERE AccountNumber = @AccountNumber 
                AND CustomerID = @CustomerID
                AND IsActive = 1
            `);

        if (accountCheck.recordset.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Source account not found or access denied' 
            });
        }

        // Verify destination account exists
        const destCheck = await pool.request()
            .input('AccountNumber', sql.VarChar, toAccountNumber)
            .query(`
                SELECT AccountID 
                FROM Accounts 
                WHERE AccountNumber = @AccountNumber
                AND IsActive = 1
            `);

        if (destCheck.recordset.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Destination account not found' 
            });
        }

        // Execute transfer procedure
        await pool.request()
            .input('FromAccountNumber', sql.VarChar, fromAccountNumber)
            .input('ToAccountNumber', sql.VarChar, toAccountNumber)
            .input('Amount', sql.Decimal(15, 2), amount)
            .execute('sp_TransferMoney');

        // Get updated balance
        const balanceResult = await pool.request()
            .input('AccountNumber', sql.VarChar, fromAccountNumber)
            .query('SELECT Balance FROM Accounts WHERE AccountNumber = @AccountNumber');

        res.json({
            success: true,
            message: 'Transfer successful',
            newBalance: balanceResult.recordset[0].Balance
        });

    } catch (error) {
        console.error('Transfer error:', error);
        
        if (error.message && error.message.includes('Insufficient funds')) {
            return res.status(400).json({ 
                success: false, 
                message: 'Insufficient funds' 
            });
        }

        if (error.message && error.message.includes('Cannot transfer to same account')) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot transfer to the same account' 
            });
        }

        res.status(500).json({ 
            success: false, 
            message: 'Error processing transfer' 
        });
    }
});

// @route   GET /api/transactions/history/:accountNumber
// @desc    Get transaction history for an account
// @access  Private
router.get('/history/:accountNumber', authMiddleware, async (req, res) => {
    try {
        const pool = await getPool();

        // Verify account belongs to customer
        const accountCheck = await pool.request()
            .input('AccountNumber', sql.VarChar, req.params.accountNumber)
            .input('CustomerID', sql.Int, req.user.customerID)
            .query(`
                SELECT AccountID 
                FROM Accounts 
                WHERE AccountNumber = @AccountNumber 
                AND CustomerID = @CustomerID
                AND IsActive = 1
            `);

        if (accountCheck.recordset.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Account not found or access denied' 
            });
        }

        const accountID = accountCheck.recordset[0].AccountID;

        // Get transaction history
        const result = await pool.request()
            .input('AccountID', sql.Int, accountID)
            .query(`
                SELECT 
                    T.TransactionID,
                    FA.AccountNumber AS FromAccount,
                    TA.AccountNumber AS ToAccount,
                    T.TransactionType,
                    T.Amount,
                    T.TransactionDate
                FROM Transactions T
                LEFT JOIN Accounts FA ON T.FromAccountID = FA.AccountID
                LEFT JOIN Accounts TA ON T.ToAccountID = TA.AccountID
                WHERE T.FromAccountID = @AccountID OR T.ToAccountID = @AccountID
                ORDER BY T.TransactionDate DESC
            `);

        res.json({
            success: true,
            transactions: result.recordset
        });

    } catch (error) {
        console.error('Get transaction history error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching transaction history' 
        });
    }
});

// @route   GET /api/transactions/recent
// @desc    Get recent transactions for all customer accounts
// @access  Private
router.get('/recent', authMiddleware, async (req, res) => {
    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('CustomerID', sql.Int, req.user.customerID)
            .query(`
                SELECT TOP 20
                    T.TransactionID,
                    FA.AccountNumber AS FromAccount,
                    TA.AccountNumber AS ToAccount,
                    T.TransactionType,
                    T.Amount,
                    T.TransactionDate
                FROM Transactions T
                LEFT JOIN Accounts FA ON T.FromAccountID = FA.AccountID
                LEFT JOIN Accounts TA ON T.ToAccountID = TA.AccountID
                WHERE FA.CustomerID = @CustomerID OR TA.CustomerID = @CustomerID
                ORDER BY T.TransactionDate DESC
            `);

        res.json({
            success: true,
            transactions: result.recordset
        });

    } catch (error) {
        console.error('Get recent transactions error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching recent transactions' 
        });
    }
});

module.exports = router;