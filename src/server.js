require("dotenv").config();

const app = require("./app");

const PORT =
    process.env.PORT || 5000;

// const HOST = "0.0.0.0";


app.listen(PORT, () => {

    console.log(
        `Server running on port ${PORT}`
    );

});