const routeService = require("../service/route.service");


// GET /api/routes
const getAll = async (req, res, next) => {

    try {

        const routes = await routeService.getAllRoutes();

        res.status(200).json({
            success: true,
            data: routes
        });

    } catch (error) {

        next(error);
    }
};


// POST /api/routes
const create = async (req, res, next) => {

    try {

        const route = await routeService.createRoute(req.body);

        res.status(201).json({
            success: true,
            message: "Route created successfully",
            data: route
        });

    } catch (error) {

        next(error);
    }
};


// PUT /api/routes/:id
const update = async (req, res, next) => {

    try {

        const id = Number(req.params.id);

        const route = await routeService.updateRoute(id, req.body);

        res.status(200).json({
            success: true,
            message: "Route updated successfully",
            data: route
        });

    } catch (error) {

        next(error);
    }
};


// PATCH /api/routes/:id/status
const updateStatus = async (req, res, next) => {

    try {

        const id = Number(req.params.id);

        const route = await routeService.updateRouteStatus(id, req.body.currentStatus);

        res.status(200).json({
            success: true,
            message: "Route status updated successfully",
            data: route
        });

    } catch (error) {

        next(error);
    }
};


module.exports = {
    getAll,
    create,
    update,
    updateStatus
};
