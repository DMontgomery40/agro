# coding: utf-8
from qdrant_client import QdrantClient
from qdrant_client.http.exceptions import UnexpectedResponse

_orig_recreate = QdrantClient.recreate_collection


def _extract_args(*args, **kwargs):
    name = kwargs.get("collection_name")
    vectors_config = kwargs.get("vectors_config")
    if name is None and args:
        name = args[0]
    if vectors_config is None and len(args) > 1:
        vectors_config = args[1]
    return name, vectors_config


def recreate_collection_safe(self, *args, **kwargs):
    try:
        return _orig_recreate(self, *args, **kwargs)
    except UnexpectedResponse as e:
        # Some servers return 404 on delete step inside recreate
        if getattr(e, "status_code", None) == 404:
            name, vectors_config = _extract_args(*args, **kwargs)
            return self.create_collection(collection_name=name, vectors_config=vectors_config)
        raise
    except Exception:
        # Very defensive fallback: try delete (ignore errors), then create
        name, vectors_config = _extract_args(*args, **kwargs)
        try:
            try:
                self.delete_collection(name)
            except Exception:
                pass
            return self.create_collection(collection_name=name, vectors_config=vectors_config)
        except Exception:
            raise


QdrantClient.recreate_collection = recreate_collection_safe

