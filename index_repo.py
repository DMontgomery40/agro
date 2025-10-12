from indexer.index_repo import *  # noqa: F401,F403

if __name__ == "__main__":
    # Run canonical entrypoint when invoked as a script
    from indexer.index_repo import main as _main
    _main()
