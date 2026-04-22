/**
 * Supported qPCR instruments for template generation and result import.
 * Adding a new machine = add parser in qpcr-result-parse.ts, template branch in qpcr-experiments route, and one entry here.
 */

export interface QpcrInstrument {
  id: 'Biorad_CFX' | 'QuantStudio'
  displayName: string
  templateFileExtension: string
  templateMimeType: string
}

export const SUPPORTED_QPCR_INSTRUMENTS: QpcrInstrument[] = [
  {
    id: 'Biorad_CFX',
    displayName: 'Bio-Rad CFX 96',
    templateFileExtension: 'csv',
    templateMimeType: 'text/csv; charset=utf-8',
  },
  {
    id: 'QuantStudio',
    displayName: 'Quant Studio',
    templateFileExtension: 'txt',
    templateMimeType: 'text/tab-separated-values; charset=utf-8',
  },
]

export function getQpcrInstrumentById(id: string): QpcrInstrument | undefined {
  return SUPPORTED_QPCR_INSTRUMENTS.find((i) => i.id === id)
}
