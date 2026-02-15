import { createBrowserRouter } from "react-router";
import { Root } from "@/app/components/Root";
import {
  ProtectedDashboard,
  ProtectedPortfolio,
  ProtectedStockList,
  ProtectedStock,
  ProtectedThesis,
  ProtectedCommunity,
} from "@/app/pages/ProtectedPages";
import { Login } from "@/app/pages/Login";
import { Signup } from "@/app/pages/Signup";
import { NotFound } from "@/app/pages/NotFound";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/signup",
    Component: Signup,
  },
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: ProtectedDashboard },
      { path: "portfolio", Component: ProtectedPortfolio },
      { path: "stocks", Component: ProtectedStockList },
      { path: "stock/:symbol", Component: ProtectedStock },
      { path: "thesis", Component: ProtectedThesis },
      { path: "community", Component: ProtectedCommunity },
      { path: "*", Component: NotFound },
    ],
  },
]);
