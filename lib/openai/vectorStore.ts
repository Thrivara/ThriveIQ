import OpenAI from 'openai';

export function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function ensureVectorStore(
  projectId: string,
  project: any,
  persistVectorStoreId: (vectorStoreId: string) => Promise<void>
) {
  const existing = project?.openai_vector_store_id ?? project?.openaiVectorStoreId;
  if (existing) return existing as string;
  const openai = getOpenAI();
  const vs = await openai.vectorStores.create({ name: `project-${projectId}` });
  await persistVectorStoreId(vs.id);
  return vs.id;
}

export async function uploadFileToVectorStore(file: File, vectorStoreId: string) {
  const openai = getOpenAI();
  // Upload file to OpenAI Files (SDK infers filename from File object; no 'filename' param)
  const ofile = await openai.files.create({ file: file as any, purpose: 'assistants' });
  // Attach to vector store
  await openai.vectorStores.files.create(vectorStoreId, { file_id: ofile.id });
  return ofile.id;
}

export async function getVectorFileStatus(vectorStoreId: string, fileId: string) {
  const openai = getOpenAI();
  const vf = await openai.vectorStores.files.retrieve(vectorStoreId, fileId);
  return vf;
}
