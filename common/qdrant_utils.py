from __future__ import annotations

"""Qdrant recreate fallback wrappers to avoid hard failures on 404/exists."""

def recreate_collection(client, collection_name: str, vectors_config):
    try:
        return client.recreate_collection(collection_name=collection_name, vectors_config=vectors_config)
    except Exception as e:
        # If API doesn't support recreate, try delete/create sequence
        try:
            client.delete_collection(collection_name)
        except Exception:
            pass
        return client.create_collection(collection_name=collection_name, vectors_config=vectors_config)

