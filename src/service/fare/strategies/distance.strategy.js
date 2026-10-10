const { badRequest } = require("../../../utils/errors");
const { optionalFareId, requiredAmount } = require("../../../utils/validators");

module.exports = {
    collection: "distanceFare",

    validate(items) {
        return items.map((fare, index) => {
            const field = `distanceFare[${index}]`;
            const minkm = requiredAmount(fare.Minkm, `${field}.Minkm`);
            const maxkm = requiredAmount(fare.Maxkm, `${field}.Maxkm`);

            if (maxkm !== 0 && maxkm <= minkm) {
                throw badRequest(`${field}.Maxkm must be greater than Minkm, or 0 for no upper limit`);
            }

            return {
                Id: optionalFareId(fare.Id, field),
                minkm,
                maxkm,
                standardFare: requiredAmount(fare.StandardFare, `${field}.StandardFare`),
                offPeakFare: requiredAmount(fare.OffPeakFare, `${field}.OffPeakFare`)
            };
        });
    }
};
