import { Link } from 'react-router-dom'

export default function ChatsPage() {
  return (
    <div className="card">
      <h1>Chats</h1>
      <div className="list">
        <Link className="list-item" to="/chats/1">New Chat 1</Link>
        <Link className="list-item" to="/chats/2">New Chat 2</Link>
      </div>
      <button>New chat</button>
    </div>
  )
}
