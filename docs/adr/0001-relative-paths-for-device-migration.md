# Relative paths so the app can move to a new Mac

Every file location in the database is stored relative to the `DMM OS` root folder, never as an absolute path. Moving to a new Mac means copying the `DMM OS` folder and the latest Vault backup, then restoring from Configuración. We rejected absolute paths plus a find-and-replace migration tool, because that breaks silently when home folders or volume names differ. External HDD locations are stored relative to that drive's root, which mirrors the `DMM OS` layout. Changing this later means rewriting every stored path, so it is decided up front.
