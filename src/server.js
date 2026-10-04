require("dotenv").config();

const app = require("./app");
const { getDb } = require("./config/database");

const PORT = process.env.PORT || 5000;

getDb()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch((error) => {
        console.error("MongoDB connection failed:", error.message);
        process.exit(1);
    });
