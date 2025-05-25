from fastapi import FastAPI, HTTPException
import os

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/emitir_nfe")
def emitir_nfe(dados: dict):
    # TODO: implementar lógica de emissão de NF-e usando dados e env vars
    ambiente = os.getenv("NF_AMBIENTE")
    cnpj = os.getenv("NF_CNPJ")
    return {"message": "Emissão de NF-e não implementada", "ambiente": ambiente, "cnpj": cnpj}
