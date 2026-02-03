-- Replace legacy template_exported status with in_progress
UPDATE qpcr_experiment SET status = 'in_progress' WHERE status = 'template_exported';
