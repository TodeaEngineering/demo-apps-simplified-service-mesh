'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClientStats } from '@/lib/types';

interface Props {
  running: boolean;
  clients: ClientStats[];
  httpPods: number;
  grpcPods: number;
  grpcSummary?: string;
}

interface Packet {
  p: number; // progress 0..1
  err: boolean;
}

// Fixed client slots, matched to live ClientStats by (protocol, meshed).
const SLOTS = [
  { key: 'http', name: 'client-http', proto: 'HTTP', protocol: 'http' as const, meshed: true, server: 'http' as const },
  { key: 'grpc-meshed', name: 'client-grpc-meshed', proto: 'gRPC', protocol: 'grpc' as const, meshed: true, server: 'grpc' as const },
  { key: 'grpc-unmeshed', name: 'client-grpc-unmeshed', proto: 'gRPC', protocol: 'grpc' as const, meshed: false, server: 'grpc' as const },
];

// Geometry in the SVG's 1000×330 user space.
const CLIENT_RIGHT = 250; // right edge of the client boxes
const SERVER_LEFT = 750; // left edge of the server boxes
const CLIENT_CY: Record<string, number> = { http: 66, 'grpc-meshed': 165, 'grpc-unmeshed': 264 };
const SERVER_CY = { http: 66, grpc: 215 };
const SPEED = 0.6;
const MAX_PACKETS = 26;

function lerp(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function liveFor(clients: ClientStats[], protocol: 'http' | 'grpc', meshed: boolean): ClientStats | undefined {
  return clients.find((c) => c.protocol === protocol && c.meshed === meshed);
}

export default function TrafficTopology(props: Props) {
  const propsRef = useRef(props);
  propsRef.current = props;

  const packets = useRef<Record<string, Packet[]>>({ http: [], 'grpc-meshed': [], 'grpc-unmeshed': [] });
  const acc = useRef<Record<string, number>>({ http: 0, 'grpc-meshed': 0, 'grpc-unmeshed': 0 });
  const last = useRef(0);
  const [, force] = useState(0);

  useEffect(() => {
    let raf = 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const step = (now: number) => {
      if (!last.current) last.current = now;
      const dt = Math.min(0.05, (now - last.current) / 1000);
      last.current = now;
      const { running, clients } = propsRef.current;

      for (const slot of SLOTS) {
        const arr = packets.current[slot.key];
        for (const pk of arr) pk.p += dt * SPEED;
        packets.current[slot.key] = arr.filter((pk) => pk.p <= 1);

        const live = liveFor(clients, slot.protocol, slot.meshed);
        const rps = live?.rps ?? 0;
        const errRate = live ? (100 - live.successRate) / 100 : 0;

        if (!running || reduce) {
          acc.current[slot.key] = 0;
          continue;
        }
        acc.current[slot.key] += rps * dt;
        while (acc.current[slot.key] >= 1 && packets.current[slot.key].length < MAX_PACKETS) {
          acc.current[slot.key] -= 1;
          packets.current[slot.key].push({ p: 0, err: Math.random() < errRate });
        }
        if (acc.current[slot.key] > 2) acc.current[slot.key] = 2;
      }

      force((n) => (n + 1) & 0xffff);
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const { running, clients, httpPods, grpcPods, grpcSummary } = props;

  return (
    <div className="border border-neutral-200 rounded-2xl bg-neutral-50 p-2 sm:p-3 overflow-hidden">
      <svg
        viewBox="0 0 1000 330"
        className="w-full"
        style={{ aspectRatio: '1000 / 330' }}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Traffic flowing from the three client pods to the HTTP and gRPC servers"
      >
        {/* Edges */}
        {SLOTS.map((slot) => (
          <Edge
            key={slot.key}
            from={{ x: CLIENT_RIGHT, y: CLIENT_CY[slot.key] }}
            to={{ x: SERVER_LEFT, y: SERVER_CY[slot.server] }}
            active={running}
            secure={slot.meshed}
          />
        ))}

        {/* Packets */}
        {SLOTS.map((slot) =>
          packets.current[slot.key].map((pk, i) => {
            const pos = lerp({ x: CLIENT_RIGHT, y: CLIENT_CY[slot.key] }, { x: SERVER_LEFT, y: SERVER_CY[slot.server] }, pk.p);
            return <circle key={`${slot.key}${i}`} cx={pos.x} cy={pos.y} r={3.6} fill={pk.err ? '#ef4444' : '#000'} />;
          }),
        )}

        {/* Edge labels — drawn after the packets so the rps stays readable */}
        {SLOTS.map((slot) => (
          <EdgeLabel
            key={slot.key}
            from={{ x: CLIENT_RIGHT, y: CLIENT_CY[slot.key] }}
            to={{ x: SERVER_LEFT, y: SERVER_CY[slot.server] }}
            rps={liveFor(clients, slot.protocol, slot.meshed)?.rps ?? 0}
            active={running}
            secure={slot.meshed}
          />
        ))}

        {/* Client nodes */}
        {SLOTS.map((slot) => (
          <ClientNode key={slot.key} y={CLIENT_CY[slot.key]} proto={slot.proto} name={slot.name} meshed={slot.meshed} />
        ))}

        {/* Server nodes */}
        <ServerNode y={SERVER_CY.http} title="HTTP server" sub={instanceLabel(httpPods)} active={running} />
        <ServerNode
          y={SERVER_CY.grpc}
          title="gRPC server"
          sub={grpcSummary && grpcSummary.length > 0 ? grpcSummary : instanceLabel(grpcPods)}
          active={running}
        />
      </svg>
    </div>
  );
}

function instanceLabel(n: number): string {
  if (n <= 0) return 'awaiting traffic';
  return n === 1 ? '1 instance' : `${n} instances`;
}

function Edge({
  from,
  to,
  active,
  secure,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  active: boolean;
  secure: boolean;
}) {
  return (
    <g>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#e5e5e5" strokeWidth={2} />
      {active && (
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke={secure ? '#10b981' : '#000'}
          strokeWidth={1.5}
          strokeOpacity={secure ? 0.5 : 0.25}
          className="flow-line"
        />
      )}
    </g>
  );
}

function EdgeLabel({
  from,
  to,
  rps,
  active,
  secure,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  rps: number;
  active: boolean;
  secure: boolean;
}) {
  const mid = lerp(from, to, 0.5);
  return (
    <g>
      {/* backdrop matching the card bg, so the flowing dots don't cover the text */}
      <rect x={mid.x - 52} y={mid.y - 13} width={104} height={26} rx={7} fill="#fafafa" />
      {secure && (
        <g transform={`translate(${mid.x - 44}, ${mid.y - 5})`} aria-hidden="true">
          <g stroke="#10b981" strokeWidth={1.2} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <rect x={0.6} y={4.4} width={7.6} height={5.4} rx={1.4} />
            <path d="M2.3 4.4 V2.9 a2.1 2.1 0 0 1 4.2 0 V4.4" />
          </g>
        </g>
      )}
      <text
        x={secure ? mid.x + 6 : mid.x}
        y={mid.y + 4}
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fill={active ? '#000' : '#a3a3a3'}
        style={{ fontFamily: 'ui-monospace, monospace' }}
      >
        {rps >= 10 ? Math.round(rps) : rps.toFixed(1)} req/s
      </text>
    </g>
  );
}

function ClientNode({ y, proto, name, meshed }: { y: number; proto: string; name: string; meshed: boolean }) {
  return (
    <g>
      <rect x={40} y={y - 28} width={210} height={56} rx={13} fill="#000" />
      <text x={64} y={y - 3} fontSize="14" fontWeight="700" fill="#fff">
        {proto}
        <tspan dx="9" fontSize="10" fontWeight="700" fill={meshed ? '#34d399' : '#fbbf24'}>
          {meshed ? 'MESHED' : 'UNMESHED'}
        </tspan>
      </text>
      <text x={64} y={y + 14} fontSize="11" fill="#a3a3a3" style={{ fontFamily: 'ui-monospace, monospace' }}>
        {name}
      </text>
    </g>
  );
}

function ServerNode({ y, title, sub, active }: { y: number; title: string; sub: string; active: boolean }) {
  return (
    <g>
      <rect
        x={750}
        y={y - 32}
        width={210}
        height={64}
        rx={14}
        fill="#fff"
        stroke={active ? '#000' : '#d4d4d4'}
        strokeWidth={active ? 2 : 1.5}
      />
      <text x={855} y={y - 4} textAnchor="middle" fontSize="15" fontWeight="700" fill="#000">
        {title}
      </text>
      <text
        x={855}
        y={y + 16}
        textAnchor="middle"
        fontSize="11.5"
        fill="#737373"
        style={{ fontFamily: 'ui-monospace, monospace' }}
      >
        {sub}
      </text>
    </g>
  );
}
