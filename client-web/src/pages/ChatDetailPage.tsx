export default function ChatDetailPage() {
  return (
    <div className="card">
      <h1>Hello Trump chat</h1>
      <div className="chat">
        <div className="msg right">Hello, I need help</div>
        <div className="msg left">Sure, I can assist</div>
        <div className="msg loader">Thinking... (loader here)</div>
      </div>
      <div className="composer">
        <input placeholder="Ask me something" />
        <button>Send</button>
      </div>
    </div>
  )
}
