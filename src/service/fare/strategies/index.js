// Strategy registry: each strategy validates/normalises one fare collection of the bundle
const strategies = [
    require("./distance.strategy"),
    require("./flat.strategy"),
    require("./timeBased.strategy"),
    require("./pass.strategy")
];

module.exports = strategies;
