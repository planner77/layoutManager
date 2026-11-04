-- #225/B2-B reviewed 0.60.0 -> 0.61.0 additive CPU queue index.
CREATE INDEX "ix_scene_build_cpu_due" ON "SceneBuildJob"("builder","status","due_at");
