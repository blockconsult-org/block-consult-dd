-- Before 0.2.0, on-demand PDFs were attached to the latest Report even though
-- they represented live case data. A Report is a mutable latest snapshot, so
-- those associations could label an older PDF as part of a newer snapshot.
-- Preserve every export row and file, but remove that misleading association.
UPDATE "GeneratedFile" SET "reportId" = NULL WHERE "kind" = 'pdf';
