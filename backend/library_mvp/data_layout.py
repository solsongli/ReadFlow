"""Application-owned top-level data entries, shared by modules and launchers."""
ANNOTATION_IMAGES = 'annotation-images'
CANVAS_IMAGES = 'canvas-images'
OCR_MODULES = 'optional-ocr'
AGENT_CONFIG = 'agent-config.json'
PAPER_BLOCKS = 'paper-blocks'
BLOBS = 'blobs'
OWNED_DIRECTORIES = frozenset({PAPER_BLOCKS, BLOBS, ANNOTATION_IMAGES, CANVAS_IMAGES, OCR_MODULES})
OWNED_FILES = frozenset({
    'native-library-runtime.json', 'research-library.json', 'library.sqlite3',
    'library.sqlite3-wal', 'library.sqlite3-shm', '.gitignore', AGENT_CONFIG,
}) | OWNED_DIRECTORIES
