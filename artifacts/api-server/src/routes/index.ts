import { Router, type IRouter } from "express";
import healthRouter from "./health";
import helpdeskRouter from "./helpdesk";

const router: IRouter = Router();

router.use(healthRouter);
router.use(helpdeskRouter);

export default router;
