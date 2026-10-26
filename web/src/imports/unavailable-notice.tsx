export const UnavailableNotice = ({ id, text }: { id: string; text: string }) => (
  <p id={id} role="status" className="m-0 w-full rounded-control border bg-pending-soft px-3 py-2 text-meta text-text">
    <span className="font-semibold text-pending">Leitura indisponível.</span> {text}
  </p>
)
