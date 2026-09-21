const sql = require("mssql");

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,

    options: {
        encrypt: true,
        trustServerCertificate: false
    },

    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let pool;

const getPool = async () => {
    if (pool) {
        return pool;
    }

    try {
        pool = await sql.connect(config);

        console.log("Connected to SQL Server");

        return pool;
    } catch (error) {
        console.error("SQL Server connection failed:");
        console.error(error);

        throw error;
    }
};

module.exports = {
    sql,
    getPool
};