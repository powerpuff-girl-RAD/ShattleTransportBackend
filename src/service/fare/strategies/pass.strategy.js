const { badRequest } = require("../../../utils/errors");
const { requiredText, requiredAmount } = require("../../../utils/validators");

module.exports = {
    collection: "passes",

    validate(items) {
        return items.map((pass, index) => {
            const field = `passes[${index}]`;
            const validity = Number(pass.Validity);

            if (!Number.isInteger(validity) || validity <= 0) {
                throw badRequest(`${field}.Validity must be a positive integer`);
            }

            if (typeof pass.IsOn !== "boolean") {
                throw badRequest(`${field}.IsOn must be a boolean`);
            }

            return {
                passProduct: requiredText(pass.PassProduct, `${field}.PassProduct`),
                tagline: requiredText(pass.Tagline, `${field}.Tagline`),
                price: requiredAmount(pass.Price, `${field}.Price`),
                validity,
                usageCondition: requiredText(pass.UsageCondition, `${field}.UsageCondition`),
                isOn: pass.IsOn
            };
        });
    }
};
