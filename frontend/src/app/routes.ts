import { createBrowserRouter, redirect } from "react-router";
import { Root } from "@/app/components/Root";
import {
  ProtectedPortfolio,
  ProtectedStockList,
  ProtectedStock,
  ProtectedThesis,
  ProtectedCommunity,
  ProtectedOnboarding,
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
    path: "/onboarding",
    Component: ProtectedOnboarding,
  },
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, loader: () => redirect("/portfolio") },
      { path: "portfolio", Component: ProtectedPortfolio },
      { path: "stocks", Component: ProtectedStockList },
      { path: "stock/:symbol", Component: ProtectedStock },
      { path: "thesis", Component: ProtectedThesis },
      { path: "community", Component: ProtectedCommunity },
      { path: "*", Component: NotFound },
    ],
  },
]);
