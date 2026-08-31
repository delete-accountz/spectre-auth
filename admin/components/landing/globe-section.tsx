"use client";

import { motion } from "motion/react";
import dynamic from "next/dynamic";

const World = dynamic(() => import("@/components/ui/globe").then((m) => m.World), {
  ssr: false,
});

const globeConfig = {
  pointSize: 4,
  globeColor: "#0a0a0a",
  showAtmosphere: true,
  atmosphereColor: "#ffffff",
  atmosphereAltitude: 0.1,
  emissive: "#0a0a0a",
  emissiveIntensity: 0.1,
  shininess: 0.9,
  polygonColor: "rgba(255,255,255,0.5)",
  ambientLight: "#ffffff",
  directionalLeftLight: "#ffffff",
  directionalTopLight: "#ffffff",
  pointLight: "#ffffff",
  arcTime: 1000,
  arcLength: 0.9,
  rings: 1,
  maxRings: 3,
  initialPosition: { lat: -23.5505, lng: -46.6333 },
  autoRotate: true,
  autoRotateSpeed: 0.5,
};

const colors = ["#ffffff", "#a3a3a3", "#737373"];
const sampleArcs = [
  {
    order: 1,
    startLat: -23.5505,
    startLng: -46.6333,
    endLat: 40.7128,
    endLng: -74.006,
    arcAlt: 0.3,
    color: colors[0],
  },
  {
    order: 1,
    startLat: 51.5074,
    startLng: -0.1278,
    endLat: 35.6762,
    endLng: 139.6503,
    arcAlt: 0.4,
    color: colors[1],
  },
  {
    order: 2,
    startLat: -33.8688,
    startLng: 151.2093,
    endLat: 22.3193,
    endLng: 114.1694,
    arcAlt: 0.2,
    color: colors[2],
  },
  {
    order: 2,
    startLat: 48.8566,
    startLng: 2.3522,
    endLat: -23.5505,
    endLng: -46.6333,
    arcAlt: 0.5,
    color: colors[0],
  },
  {
    order: 3,
    startLat: 52.52,
    startLng: 13.405,
    endLat: 28.6139,
    endLng: 77.209,
    arcAlt: 0.3,
    color: colors[1],
  },
  {
    order: 3,
    startLat: 40.7128,
    startLng: -74.006,
    endLat: 34.0522,
    endLng: -118.2437,
    arcAlt: 0.2,
    color: colors[2],
  },
  {
    order: 4,
    startLat: 1.3521,
    startLng: 103.8198,
    endLat: -23.5505,
    endLng: -46.6333,
    arcAlt: 0.6,
    color: colors[0],
  },
  {
    order: 4,
    startLat: 35.6762,
    startLng: 139.6503,
    endLat: 51.5074,
    endLng: -0.1278,
    arcAlt: 0.5,
    color: colors[1],
  },
  {
    order: 5,
    startLat: -34.6037,
    startLng: -58.3816,
    endLat: 40.4168,
    endLng: -3.7038,
    arcAlt: 0.4,
    color: colors[2],
  },
  {
    order: 5,
    startLat: 19.4326,
    startLng: -99.1332,
    endLat: 41.9028,
    endLng: 12.4964,
    arcAlt: 0.5,
    color: colors[0],
  },
  {
    order: 6,
    startLat: 55.7558,
    startLng: 37.6173,
    endLat: -23.5505,
    endLng: -46.6333,
    arcAlt: 0.6,
    color: colors[1],
  },
  {
    order: 6,
    startLat: 31.2304,
    startLng: 121.4737,
    endLat: 37.5665,
    endLng: 126.978,
    arcAlt: 0.1,
    color: colors[2],
  },
];

export function GlobeSection() {
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="relative mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <span className="inline-block rounded-full border border-border bg-card/50 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur-sm mb-4">
            Cobertura Global
          </span>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-balance">
            Disponível em qualquer lugar do mundo
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
            Nossa infraestrutura distribuída garante baixa latência e alta disponibilidade para usuários em todos os continentes
          </p>
        </motion.div>

        <div className="relative h-[600px] w-full">
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background pointer-events-none z-10" />
          <World data={sampleArcs} globeConfig={globeConfig} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-12 text-center">
          {[
            { value: "99.9%", label: "Uptime Global" },
            { value: "<50ms", label: "Latência Média" },
            { value: "6", label: "Continentes" },
            { value: "150+", label: "Países" },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
            >
              <p className="text-3xl font-bold">{stat.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
