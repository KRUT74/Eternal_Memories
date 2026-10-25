// Fixed pseudo-random layout so server and client render the same particles.
const particles = Array.from({ length: 20 }, (_, i) => ({
  id: i,
  x: (i * 37 + 11) % 100,
  y: (i * 53 + 7) % 100,
  delay: ((i * 29) % 60) / 10,
}))

export default function CosmicParticles() {
  return (
    <div className="cosmic-particles" aria-hidden="true">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="cosmic-particle"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            animationDelay: `${particle.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
