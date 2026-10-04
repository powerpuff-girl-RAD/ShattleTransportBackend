const { badRequest } = require("../../../utils/errors");
const { validateRouteId, requiredText, requiredAmount } = require("../../../utils/validators");

module.exports = {
    collection: "flatFares",

    validate(items, { routeId }) {
        return items.map((fare, index) => {
            const field = `flatFares[${index}]`;

            if (fare.RouteId !== undefined && validateRouteId(fare.RouteId) !== routeId) {
                throw badRequest(`${field}.RouteId must match routeId`);
            }

            return {
                passengerType: requiredText(fare.PassengerType, `${field}.PassengerType`),
                passengerDescription: requiredText(fare.PassengerDescription, `${field}.PassengerDescription`),
                local: requiredAmount(fare.Local, `${field}.Local`),
                express: requiredAmount(fare.Express, `${field}.Express`),
                rule: requiredText(fare.Rule, `${field}.Rule`),
                status: requiredText(fare.Status, `${field}.Status`)
            };
        });
    }
};
