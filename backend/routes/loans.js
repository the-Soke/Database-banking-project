const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../config/database');
const authMiddleware = require('../middleware/auth');

// @route   POST /api/loans
// @desc    Apply for a loan
// @access  Private
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { loanAmount, interestRate, durationMonths } = req.body;

        if (!loanAmount || loanAmount <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Loan amount must be greater than 0' 
            });
        }

        if (!interestRate || interestRate <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Interest rate must be greater than 0' 
            });
        }

        if (!durationMonths || durationMonths <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Duration must be greater than 0' 
            });
        }

        const pool = await getPool();

        // Get customer's primary account
        const accountResult = await pool.request()
            .input('CustomerID', sql.Int, req.user.customerID)
            .query(`
                SELECT TOP 1 AccountID, AccountNumber, Balance
                FROM Accounts
                WHERE CustomerID = @CustomerID AND IsActive = 1
                ORDER BY DateOpened ASC
            `);

        if (accountResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No active account found. Please create an account first.'
            });
        }

        const account = accountResult.recordset[0];

        // Insert loan
        const result = await pool.request()
            .input('CustomerID', sql.Int, req.user.customerID)
            .input('LoanAmount', sql.Decimal(15, 2), loanAmount)
            .input('InterestRate', sql.Decimal(5, 2), interestRate)
            .input('DurationMonths', sql.Int, durationMonths)
            .query(`
                INSERT INTO Loans (CustomerID, LoanAmount, InterestRate, DurationMonths)
                OUTPUT INSERTED.LoanID, INSERTED.LoanAmount, INSERTED.InterestRate, INSERTED.DurationMonths, INSERTED.StartDate
                VALUES (@CustomerID, @LoanAmount, @InterestRate, @DurationMonths)
            `);

        const loan = result.recordset[0];

        // Add loan amount to account balance (as a deposit)
        await pool.request()
            .input('AccountNumber', sql.VarChar, account.AccountNumber)
            .input('Amount', sql.Decimal(15, 2), loanAmount)
            .execute('sp_DepositMoney');

        // Get updated balance
        const balanceResult = await pool.request()
            .input('AccountNumber', sql.VarChar, account.AccountNumber)
            .query('SELECT Balance FROM Accounts WHERE AccountNumber = @AccountNumber');

        res.status(201).json({
            success: true,
            message: `Loan approved! ₦${loanAmount.toFixed(2)} has been added to your account ${account.AccountNumber}`,
            loan: {
                ...loan,
                accountCredited: account.AccountNumber,
                newBalance: balanceResult.recordset[0].Balance
            }
        });

    } catch (error) {
        console.error('Loan application error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error processing loan application' 
        });
    }
});

// @route   GET /api/loans
// @desc    Get all loans for logged-in customer
// @access  Private
router.get('/', authMiddleware, async (req, res) => {
    try {
        const pool = await getPool();

        const result = await pool.request()
            .input('CustomerID', sql.Int, req.user.customerID)
            .query(`
                SELECT 
                    L.LoanID,
                    L.LoanAmount,
                    L.InterestRate,
                    L.DurationMonths,
                    L.StartDate,
                    ISNULL(SUM(R.AmountPaid), 0) AS TotalPaid
                FROM Loans L
                LEFT JOIN LoanRepayments R ON L.LoanID = R.LoanID
                WHERE L.CustomerID = @CustomerID
                GROUP BY L.LoanID, L.LoanAmount, L.InterestRate, L.DurationMonths, L.StartDate
                ORDER BY L.StartDate DESC
            `);

        // Calculate total repayment with interest for each loan
        const loansWithInterest = result.recordset.map(loan => {
            const monthlyRate = (loan.InterestRate / 100) / 12;
            const monthlyPayment = loan.LoanAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -loan.DurationMonths));
            const totalRepayment = monthlyPayment * loan.DurationMonths;
            const remainingBalance = totalRepayment - loan.TotalPaid;

            return {
                ...loan,
                TotalRepayment: parseFloat(totalRepayment.toFixed(2)),
                RemainingBalance: parseFloat(remainingBalance.toFixed(2)),
                MonthlyPayment: parseFloat(monthlyPayment.toFixed(2))
            };
        });

        res.json({
            success: true,
            loans: loansWithInterest
        });

    } catch (error) {
        console.error('Get loans error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching loans' 
        });
    }
});

// @route   GET /api/loans/:loanId
// @desc    Get loan details with repayment history
// @access  Private
router.get('/:loanId', authMiddleware, async (req, res) => {
    try {
        const pool = await getPool();

        // Get loan details
        const loanResult = await pool.request()
            .input('LoanID', sql.Int, req.params.loanId)
            .input('CustomerID', sql.Int, req.user.customerID)
            .query(`
                SELECT 
                    L.LoanID,
                    L.LoanAmount,
                    L.InterestRate,
                    L.DurationMonths,
                    L.StartDate
                FROM Loans L
                WHERE L.LoanID = @LoanID AND L.CustomerID = @CustomerID
            `);

        if (loanResult.recordset.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Loan not found or access denied' 
            });
        }

        // Get repayment history
        const repaymentsResult = await pool.request()
            .input('LoanID', sql.Int, req.params.loanId)
            .query(`
                SELECT 
                    RepaymentID,
                    AmountPaid,
                    PaymentDate
                FROM LoanRepayments
                WHERE LoanID = @LoanID
                ORDER BY PaymentDate DESC
            `);

        // Get total paid
        const totalPaidResult = await pool.request()
            .input('LoanID', sql.Int, req.params.loanId)
            .query(`
                SELECT ISNULL(SUM(AmountPaid), 0) AS TotalPaid
                FROM LoanRepayments
                WHERE LoanID = @LoanID
            `);

        const loan = loanResult.recordset[0];
        const totalPaid = totalPaidResult.recordset[0].TotalPaid;

        // Calculate total repayment with interest
        const monthlyRate = (loan.InterestRate / 100) / 12;
        const monthlyPayment = loan.LoanAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -loan.DurationMonths));
        const totalRepayment = monthlyPayment * loan.DurationMonths;
        const remainingBalance = totalRepayment - totalPaid;

        res.json({
            success: true,
            loan: {
                ...loan,
                totalPaid,
                totalRepayment: parseFloat(totalRepayment.toFixed(2)),
                remainingBalance: parseFloat(remainingBalance.toFixed(2)),
                monthlyPayment: parseFloat(monthlyPayment.toFixed(2)),
                repayments: repaymentsResult.recordset
            }
        });

    } catch (error) {
        console.error('Get loan details error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching loan details' 
        });
    }
});

// @route   POST /api/loans/:loanId/repay
// @desc    Make a loan repayment
// @access  Private
router.post('/:loanId/repay', authMiddleware, async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Payment amount must be greater than 0' 
            });
        }

        const pool = await getPool();

        // Verify loan belongs to customer and get loan details
        const loanCheck = await pool.request()
            .input('LoanID', sql.Int, req.params.loanId)
            .input('CustomerID', sql.Int, req.user.customerID)
            .query(`
                SELECT 
                    L.LoanAmount,
                    L.InterestRate,
                    L.DurationMonths,
                    ISNULL(SUM(R.AmountPaid), 0) AS TotalPaid
                FROM Loans L
                LEFT JOIN LoanRepayments R ON L.LoanID = R.LoanID
                WHERE L.LoanID = @LoanID AND L.CustomerID = @CustomerID
                GROUP BY L.LoanAmount, L.InterestRate, L.DurationMonths
            `);

        if (loanCheck.recordset.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Loan not found or access denied' 
            });
        }

        const loan = loanCheck.recordset[0];
        
        // Calculate total amount to repay (principal + interest)
        const monthlyRate = (loan.InterestRate / 100) / 12;
        const monthlyPayment = loan.LoanAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -loan.DurationMonths));
        const totalRepayment = monthlyPayment * loan.DurationMonths;
        const remainingBalance = totalRepayment - loan.TotalPaid;

        if (amount > remainingBalance) {
            return res.status(400).json({ 
                success: false, 
                message: `Payment amount exceeds remaining balance of ₦${remainingBalance.toFixed(2)}` 
            });
        }

        // Get customer's primary account
        const accountResult = await pool.request()
            .input('CustomerID', sql.Int, req.user.customerID)
            .query(`
                SELECT TOP 1 AccountID, AccountNumber, Balance
                FROM Accounts
                WHERE CustomerID = @CustomerID AND IsActive = 1
                ORDER BY DateOpened ASC
            `);

        if (accountResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No active account found'
            });
        }

        const account = accountResult.recordset[0];

        // Check if account has sufficient balance
        if (account.Balance < amount) {
            return res.status(400).json({
                success: false,
                message: `Insufficient funds. Your balance is ₦${account.Balance.toFixed(2)} but you need ₦${amount.toFixed(2)}`
            });
        }

        // Deduct from account balance (as withdrawal)
        await pool.request()
            .input('AccountNumber', sql.VarChar, account.AccountNumber)
            .input('Amount', sql.Decimal(15, 2), amount)
            .execute('sp_WithdrawMoney');

        // Make repayment
        await pool.request()
            .input('LoanID', sql.Int, req.params.loanId)
            .input('AmountPaid', sql.Decimal(15, 2), amount)
            .query(`
                INSERT INTO LoanRepayments (LoanID, AmountPaid)
                VALUES (@LoanID, @AmountPaid)
            `);

        const newRemainingBalance = remainingBalance - amount;

        // Get updated account balance
        const balanceResult = await pool.request()
            .input('AccountNumber', sql.VarChar, account.AccountNumber)
            .query('SELECT Balance FROM Accounts WHERE AccountNumber = @AccountNumber');

        res.json({
            success: true,
            message: 'Payment successful',
            amountPaid: amount,
            remainingBalance: parseFloat(newRemainingBalance.toFixed(2)),
            isFullyPaid: newRemainingBalance <= 0.01,
            accountDebited: account.AccountNumber,
            newAccountBalance: balanceResult.recordset[0].Balance
        });

    } catch (error) {
        console.error('Loan repayment error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error processing loan repayment' 
        });
    }
});

// @route   POST /api/loans/simulate
// @desc    Simulate loan repayment schedule
// @access  Public (doesn't require auth)
router.post('/simulate', async (req, res) => {
    try {
        const { loanAmount, interestRate, durationMonths } = req.body;

        if (!loanAmount || loanAmount <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Loan amount must be greater than 0' 
            });
        }

        if (!interestRate || interestRate <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Interest rate must be greater than 0' 
            });
        }

        if (!durationMonths || durationMonths <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Duration must be greater than 0' 
            });
        }

        // Calculate monthly payment using amortization formula
        const monthlyRate = (interestRate / 100) / 12;
        const monthlyPayment = loanAmount * monthlyRate / (1 - Math.pow(1 + monthlyRate, -durationMonths));

        let balance = loanAmount;
        let totalInterest = 0;
        const schedule = [];

        for (let month = 1; month <= durationMonths; month++) {
            const interestPayment = balance * monthlyRate;
            const principalPayment = monthlyPayment - interestPayment;
            balance -= principalPayment;
            totalInterest += interestPayment;

            schedule.push({
                month,
                payment: parseFloat(monthlyPayment.toFixed(2)),
                principal: parseFloat(principalPayment.toFixed(2)),
                interest: parseFloat(interestPayment.toFixed(2)),
                balance: parseFloat(Math.max(balance, 0).toFixed(2))
            });
        }

        res.json({
            success: true,
            summary: {
                monthlyPayment: parseFloat(monthlyPayment.toFixed(2)),
                totalInterest: parseFloat(totalInterest.toFixed(2)),
                totalRepayment: parseFloat((monthlyPayment * durationMonths).toFixed(2))
            },
            schedule
        });

    } catch (error) {
        console.error('Loan simulation error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error simulating loan' 
        });
    }
});

module.exports = router;