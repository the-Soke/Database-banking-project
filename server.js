const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { getPool } = require('./backend/config/database');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// API Routes
app.use('/api/auth', require('./backend/routes/auth'));
app.use('/api/accounts', require('./backend/routes/accounts'));
app.use('/api/transactions', require('./backend/routes/transactions'));
app.use('/api/loans', require('./backend/routes/loans'));
app.use('/api/customers', require('./backend/routes/customers'));

// Health check with DB test
app.get('/api/health', async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request().query('SELECT 1');
        res.json({ 
            success: true,
            message: 'Server and database are healthy',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            success: false,
            message: 'Database connection failed',
            error: error.message
        });
    }
});

// Root route
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Banking System API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            accounts: '/api/accounts',
            transactions: '/api/transactions',
            loans: '/api/loans',
            customers: '/api/customers',
            health: '/api/health'
        }
    });
});

const PORT = process.env.PORT || 5000;

// Start server with DB connection test
const startServer = async () => {
    try {
        const pool = await getPool();
        console.log('✅ Database connected successfully');

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📡 API: http://localhost:${PORT}`);
            console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        console.error('Error details:', error.message);
        process.exit(1);
    }
};

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    process.exit(0);
});