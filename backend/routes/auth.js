// const express = require('express');
// const router = express.Router();
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const { body, validationResult } = require('express-validator');
// const { getPool, sql } = require('../config/database');

// // @route   POST /api/auth/signup
// // @desc    Register new customer
// // @access  Public
// router.post('/signup', [
//     body('firstName').notEmpty().trim().withMessage('First name is required'),
//     body('lastName').notEmpty().trim().withMessage('Last name is required'),
//     body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
//     body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
//     body('phone').optional().trim(),
//     body('address').optional().trim()
// ], async (req, res) => {
//     try {
//         // Validate input
//         const errors = validationResult(req);
//         if (!errors.isEmpty()) {
//             return res.status(400).json({ 
//                 success: false, 
//                 errors: errors.array() 
//             });
//         }

//         const { firstName, lastName, email, password, phone, address } = req.body;

//         const pool = await getPool();

//         // Check if user already exists
//         const checkUser = await pool.request()
//             .input('email', sql.VarChar, email)
//             .query('SELECT * FROM Customers WHERE Email = @email');

//         if (checkUser.recordset.length > 0) {
//             return res.status(400).json({ 
//                 success: false, 
//                 message: 'User already exists with this email' 
//             });
//         }

//         // Hash password
//         const salt = await bcrypt.genSalt(10);
//         const hashedPassword = await bcrypt.hash(password, salt);

//         // Insert new customer
//         const result = await pool.request()
//             .input('firstName', sql.VarChar, firstName)
//             .input('lastName', sql.VarChar, lastName)
//             .input('email', sql.VarChar, email)
//             .input('passwordHash', sql.VarChar, hashedPassword)
//             .input('phone', sql.VarChar, phone || null)
//             .input('address', sql.VarChar, address || null)
//             .query(`
//                 INSERT INTO Customers (FirstName, LastName, Email, PasswordHash, Phone, Address)
//                 OUTPUT INSERTED.CustomerID, INSERTED.FirstName, INSERTED.LastName, INSERTED.Email
//                 VALUES (@firstName, @lastName, @email, @passwordHash, @phone, @address)
//             `);

//         const customer = result.recordset[0];

//         // Generate account number
//         const accountNumber = 'ACC' + Date.now() + Math.floor(Math.random() * 1000);

//         // Create default savings account
//         await pool.request()
//             .input('CustomerID', sql.Int, customer.CustomerID)
//             .input('AccountNumber', sql.VarChar, accountNumber)
//             .input('AccountType', sql.VarChar, 'Savings')
//             .input('InitialDeposit', sql.Decimal(15, 2), 0)
//             .execute('sp_OpenAccount');

//         // Create JWT token
//         const payload = {
//             customerID: customer.CustomerID,
//             email: customer.Email
//         };

//         const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

//         res.status(201).json({
//             success: true,
//             message: 'Account created successfully',
//             token,
//             customer: {
//                 customerID: customer.CustomerID,
//                 firstName: customer.FirstName,
//                 lastName: customer.LastName,
//                 email: customer.Email
//             }
//         });

//     } catch (error) {
//         console.error('Signup error:', error);
//         res.status(500).json({ 
//             success: false, 
//             message: 'Server error during signup' 
//         });
//     }
// });

// // @route   POST /api/auth/login
// // @desc    Login customer
// // @access  Public
// router.post('/login', [
//     body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
//     body('password').notEmpty().withMessage('Password is required')
// ], async (req, res) => {
//     try {
//         // Validate input
//         const errors = validationResult(req);
//         if (!errors.isEmpty()) {
//             return res.status(400).json({ 
//                 success: false, 
//                 errors: errors.array() 
//             });
//         }

//         const { email, password } = req.body;

//         const pool = await getPool();

//         // Find customer with password
//         const result = await pool.request()
//             .input('email', sql.VarChar, email)
//             .query(`
//                 SELECT CustomerID, FirstName, LastName, Email, PasswordHash, IsActive 
//                 FROM Customers 
//                 WHERE Email = @email
//             `);

//         if (result.recordset.length === 0) {
//             return res.status(400).json({ 
//                 success: false, 
//                 message: 'Invalid credentials' 
//             });
//         }

//         const customer = result.recordset[0];

//         if (!customer.IsActive) {
//             return res.status(403).json({ 
//                 success: false, 
//                 message: 'Account is inactive' 
//             });
//         }

//         // Verify password
//         const isMatch = await bcrypt.compare(password, customer.PasswordHash);

//         if (!isMatch) {
//             return res.status(400).json({ 
//                 success: false, 
//                 message: 'Invalid credentials' 
//             });
//         }

//         // Create JWT token
//         const payload = {
//             customerID: customer.CustomerID,
//             email: customer.Email
//         };

//         const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

//         res.json({
//             success: true,
//             message: 'Login successful',
//             token,
//             customer: {
//                 customerID: customer.CustomerID,
//                 firstName: customer.FirstName,
//                 lastName: customer.LastName,
//                 email: customer.Email
//             }
//         });

//     } catch (error) {
//         console.error('Login error:', error);
//         res.status(500).json({ 
//             success: false, 
//             message: 'Server error during login' 
//         });
//     }
// });

// module.exports = router;

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { getPool, sql } = require('../config/database');

// @route   POST /api/auth/signup
// @desc    Register new customer
// @access  Public
router.post('/signup', [
    body('firstName').notEmpty().trim().withMessage('First name is required'),
    body('lastName').notEmpty().trim().withMessage('Last name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('phone').optional().trim(),
    body('address').optional().trim()
], async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false, 
                errors: errors.array() 
            });
        }

        const { firstName, lastName, email, password, phone, address } = req.body;

        const pool = await getPool();

        // Check if user already exists
        const checkUser = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT * FROM Customers WHERE Email = @email');

        if (checkUser.recordset.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'User already exists with this email' 
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Insert new customer
        const result = await pool.request()
            .input('firstName', sql.VarChar, firstName)
            .input('lastName', sql.VarChar, lastName)
            .input('email', sql.VarChar, email)
            .input('passwordHash', sql.VarChar, hashedPassword)
            .input('phone', sql.VarChar, phone || null)
            .input('address', sql.VarChar, address || null)
            .input('userRole', sql.VarChar, 'Customer')
            .query(`
                INSERT INTO Customers (FirstName, LastName, Email, PasswordHash, Phone, Address, UserRole)
                OUTPUT INSERTED.CustomerID, INSERTED.FirstName, INSERTED.LastName, INSERTED.Email, INSERTED.UserRole
                VALUES (@firstName, @lastName, @email, @passwordHash, @phone, @address, @userRole)
            `);

        const customer = result.recordset[0];

        // Generate account number
        const accountNumber = 'ACC' + Date.now() + Math.floor(Math.random() * 1000);

        // Create default savings account
        await pool.request()
            .input('CustomerID', sql.Int, customer.CustomerID)
            .input('AccountNumber', sql.VarChar, accountNumber)
            .input('AccountType', sql.VarChar, 'Savings')
            .input('InitialDeposit', sql.Decimal(15, 2), 0)
            .execute('sp_OpenAccount');

        // Create JWT token
        const payload = {
            customerID: customer.CustomerID,
            email: customer.Email
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            token,
            customer: {
                customerID: customer.CustomerID,
                firstName: customer.FirstName,
                lastName: customer.LastName,
                email: customer.Email,
                userRole: customer.UserRole || 'Customer'
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during signup' 
        });
    }
});

// @route   POST /api/auth/login
// @desc    Login customer
// @access  Public
router.post('/login', [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false, 
                errors: errors.array() 
            });
        }

        const { email, password } = req.body;

        const pool = await getPool();

        // Find customer with password
        const result = await pool.request()
            .input('email', sql.VarChar, email)
            .query(`
                SELECT CustomerID, FirstName, LastName, Email, PasswordHash, UserRole, IsActive 
                FROM Customers 
                WHERE Email = @email
            `);

        if (result.recordset.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        const customer = result.recordset[0];

        if (!customer.IsActive) {
            return res.status(403).json({ 
                success: false, 
                message: 'Account is inactive' 
            });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, customer.PasswordHash);

        if (!isMatch) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        // Create JWT token
        const payload = {
            customerID: customer.CustomerID,
            email: customer.Email
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            message: 'Login successful',
            token,
            customer: {
                customerID: customer.CustomerID,
                firstName: customer.FirstName,
                lastName: customer.LastName,
                email: customer.Email,
                userRole: customer.UserRole || 'Customer'
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during login' 
        });
    }
});

module.exports = router;