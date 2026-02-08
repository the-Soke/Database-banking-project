const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    port: parseInt(process.env.DB_PORT),
    options: {
        encrypt: true, // Use encryption
        trustServerCertificate: true, // For local development
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let poolPromise;

const getPool = async () => {
    if (!poolPromise) {
        poolPromise = sql.connect(config);
    }
    return poolPromise;
};

module.exports = {
    sql,
    getPool
};