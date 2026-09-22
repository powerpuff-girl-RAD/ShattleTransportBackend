const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");

const { errorHandler } = require("./middleware/error.middleware");

const app = express();


// Middleware
app.use(helmet());

app.use(cors());

app.use(morgan("dev"));

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);


// Routes
app.use(
    "/api/health",
    healthRoutes
);

app.use(
    "/api/auth",
    authRoutes
);


// 404
app.use((req, res) => {

    res.status(404).json({
        success: false,
        message: "Route not found"
    });
});


// Error handler
app.use(errorHandler);


module.exports = app;