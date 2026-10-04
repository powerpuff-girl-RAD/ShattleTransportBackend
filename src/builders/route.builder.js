// Builder: assembles a nested route object (with stops) from flat Route/Stop rows
class RouteBuilder {

    constructor() {
        this.route = { stops: [] };
    }

    withRow(row) {
        this.route.id = row.RouteId;
        this.route.routeNumber = row.RouteNumber;
        this.route.routeName = row.RouteName;
        this.route.startLocation = row.StartLocation;
        this.route.endLocation = row.EndLocation;
        this.route.distanceKm = row.RouteDistanceKm;
        this.route.currentStatus = row.CurrentStatus;
        return this;
    }

    addStop(row) {
        this.route.stops.push({
            id: row.StopId,
            name: row.StopName,
            order: row.StopOrder,
            distanceFromStartKm: row.DistanceFromStartKm
        });
        return this;
    }

    build() {
        return this.route;
    }

    // Groups flat rows into one built route per RouteId
    static fromRows(rows) {
        const builders = new Map();

        for (const row of rows) {
            if (!builders.has(row.RouteId)) {
                builders.set(row.RouteId, new RouteBuilder().withRow(row));
            }
            builders.get(row.RouteId).addStop(row);
        }

        return Array.from(builders.values(), (builder) => builder.build());
    }
}

module.exports = RouteBuilder;
