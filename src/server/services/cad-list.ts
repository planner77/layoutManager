import { listQuery } from '@/domain/cad-list';
import { validateId } from '@/domain/cad';
import { CadListRepository } from '../repositories/cad-list';
export class CadListService {
  constructor(private repository: CadListRepository) {}
  search(params: URLSearchParams) { return this.repository.list(listQuery(params)); }
  options() { return this.repository.options(); }
  location(id: string) { return this.repository.location(validateId(id)); }
}
