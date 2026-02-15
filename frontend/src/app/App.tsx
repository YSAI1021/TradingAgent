import { RouterProvider } from "react-router";
import { router } from "@/app/routes";
import { AuthProvider } from "@/app/context/AuthContext";
import { Toaster } from "@/app/components/ui/sonner";

export default function App() {
  return (
    <AuthProvider>
      <Toaster />
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
