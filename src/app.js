const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const routeRoutes = require("./routes/route.routes");
const vehicleRoutes = require("./routes/vehicle.routes");
const scheduleRoutes = require("./routes/schedule.routes");
const fareRoutes = require("./routes/fare.routes");
const passengerRoutes = require("./routes/passenger.routes");
const tokenRoutes = require("./routes/token.routes");
const journeyRoutes = require("./routes/journey.routes");
const inspectorRoutes = require("./routes/inspector.routes");
const reportRoutes = require("./routes/report.routes");
const bookingRoutes = require("./routes/booking.routes");

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

app.use(
    "/api/users",
    userRoutes
);

app.use(
    "/api/routes",
    routeRoutes
);

app.use(
    "/api/vehicles",
    vehicleRoutes
);

app.use(
    "/api/schedules",
    scheduleRoutes
);

app.use(
    "/api/fare",
    fareRoutes
);

app.use(
    "/api/passenger",
    passengerRoutes
);

app.use(
    "/api/passenger/token",
    tokenRoutes
);

app.use(
    "/api/inspector",
    inspectorRoutes
);

app.use(
    "/api/journey",
    journeyRoutes
);

app.use(
    "/api/reports",
    reportRoutes
);

app.use(
    "/api/booking",
    bookingRoutes
);

app.use((req, res) => {

    res.status(404).json({
        success: false,
        message: "Route not found"
    });
});


// Error handler
app.use(errorHandler);


module.exports = app;