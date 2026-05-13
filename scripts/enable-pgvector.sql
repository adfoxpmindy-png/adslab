-- Enable pgvector for Phase 7 (AI Master) RAG knowledge base.
-- Run once per database. Neon supports pgvector out of the box.
CREATE EXTENSION IF NOT EXISTS vector;
