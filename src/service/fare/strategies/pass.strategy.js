const { badRequest } = require("../../../utils/errors");
const { optionalFareId, requiredText, requiredAmount } = require("../../../utils/validators");

module.exports = {
    collection: "passes",

    validate(items) {
        return items.map((pass, index) => {
            const field = `passes[${index}]`;

            if (typeof pass.IsOn !== "boolean") {
                throw badRequest(`${field}.IsOn must be a boolean`);
            }

            return {
                Id: optionalFareId(pass.Id, field),
                passProduct: requiredText(pass.PassProduct, `${field}.PassProduct`),
                tagline: requiredText(pass.Tagline, `${field}.Tagline`),
                price: requiredAmount(pass.Price, `${field}.Price`),
                validity: requiredText(pass.Validity, `${field}.Validity`),
                usageCondition: requiredText(pass.UsageCondition, `${field}.UsageCondition`),
                isOn: pass.IsOn
            };
        });
    }
};
