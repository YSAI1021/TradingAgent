import { createBrowserRouter } from "react-router";
import { Root } from "@/app/components/Root";
import { Dashboard } from "@/app/pages/Dashboard";
import { Portfolio } from "@/app/pages/Portfolio";
import { StockList } from "@/app/pages/StockList";
import { Stock } from "@/app/pages/Stock";
import { Thesis } from "@/app/pages/Thesis";
import { Community } from "@/app/pages/Community";
import { NotFound } from "@/app/pages/NotFound";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Dashboard },
      { path: "portfolio", Component: Portfolio },
      { path: "stocks", Component: StockList },
      { path: "stock/:symbol", Component: Stock },
      { path: "thesis", Component: Thesis },
      { path: "community", Component: Community },
      { path: "*", Component: NotFound },
    ],
  },
]);
