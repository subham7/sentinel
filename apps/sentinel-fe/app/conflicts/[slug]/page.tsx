export default function TheaterPage({ params }: { params: { slug: string } }) {
  return <div style={{ color: 'white', padding: '2rem' }}>Theater: {params.slug} (Phase 0 placeholder)</div>
}
