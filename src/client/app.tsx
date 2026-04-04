import { createBrowserRouter, RouterProvider, Navigate } from "react-router"
import { ConnectionPage } from "./components/connection/connection-page"
import { ChatLayout } from "./components/chat/chat-layout"
import { SettingsPage } from "./components/settings/settings-page"

const router = createBrowserRouter([
  { path: "/", element: <ConnectionPage /> },
  { path: "/chat", element: <ChatLayout /> },
  { path: "/settings", element: <SettingsPage /> },
  { path: "*", element: <Navigate to="/" replace /> },
])

export function App() {
  return <RouterProvider router={router} />
}
