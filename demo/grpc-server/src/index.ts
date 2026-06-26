// Tiny gRPC echo server.
//
// Implements the single unary RPC from echo.proto: it echoes the request's
// seq + payload size and stamps the response with its own identity (logical
// name + pod/host). That identity is what the dashboard uses to show which
// instance answered — handy for demonstrating how (un)evenly gRPC's long-lived
// HTTP/2 connections spread across replicas without a mesh.
import path from 'node:path';
import { hostname } from 'node:os';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PORT = Number(process.env.PORT ?? 50051);
const SERVER_NAME = process.env.SERVER_NAME ?? 'grpc-server';
const VERSION = process.env.VERSION ?? 'v1';
const POD = process.env.HOSTNAME ?? hostname();
const PROTO_PATH = process.env.PROTO_PATH ?? path.join(process.cwd(), 'proto', 'echo.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const proto = grpc.loadPackageDefinition(packageDef) as any;

function echo(
  call: grpc.ServerUnaryCall<{ seq: string; payload: string }, unknown>,
  callback: grpc.sendUnaryData<unknown>,
) {
  const { seq, payload } = call.request;
  const bytes = typeof payload === 'string' ? Buffer.byteLength(payload) : 0;
  callback(null, { seq, server: SERVER_NAME, pod: POD, bytes, version: VERSION });
}

const server = new grpc.Server();
server.addService(proto.echo.EchoService.service, { Echo: echo });

server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error(`[${SERVER_NAME}] bind failed:`, err);
    process.exit(1);
  }
  console.log(`[${SERVER_NAME}/${VERSION}] gRPC listening on :${port} (pod ${POD})`);
});

function shutdown(signal: string) {
  console.log(`[${SERVER_NAME}] ${signal} — shutting down`);
  server.tryShutdown(() => process.exit(0));
  // Hard stop if graceful drain stalls.
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
