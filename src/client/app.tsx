import { createBrowserRouter, RouterProvider, Navigate } from "react-router"
import { ConnectionPage } from "./components/connection/connection-page"

function ChatPage() {
  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-muted-foreground">Chat coming in Phase 2</p>
    </div>
  )
}

const router = createBrowserRouter([
  { path: "/", element: <ConnectionPage /> },
  { path: "/chat", element: <ChatPage /> },
  { path: "*", element: <Navigate to="/" replace /> },
])

export function App() {
  return <RouterProvider router={router} />
}
