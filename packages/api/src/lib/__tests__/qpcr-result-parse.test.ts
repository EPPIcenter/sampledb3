import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseBioradCsv, parseQuantStudioXls } from '../qpcr-result-parse'

describe('qpcr-result-parse', () => {
  describe('parseBioradCsv', () => {
    it('returns runMetadata and wellResults with empty arrays when no data', () => {
      const result = parseBioradCsv('', 'test.csv')
      expect(result).toHaveProperty('runMetadata')
      expect(result).toHaveProperty('wellResults')
      expect(result).toHaveProperty('amplificationData')
      expect(result.wellResults).toEqual([])
      expect(result.amplificationData).toEqual([])
      expect(result.runMetadata.fileName).toBe('test.csv')
    })

    it('parses metadata rows Run Started, Run Ended, File Name', () => {
      const csv = [
        'Run Started,2024-01-15 10:00:00',
        'Run Ended,2024-01-15 11:00:00',
        'File Name,MyExperiment',
        '',
        'Well,Content,Sample,Cq,Starting Quantity (SQ)',
        'A1,Std-1,10k,12.5,10000',
        'A2,Neg Ctrl-6,Neg ctrl,,',
      ].join('\n')
      const result = parseBioradCsv(csv, 'uploaded.csv')
      expect(result.runMetadata.runStartedAt).toBe('2024-01-15 10:00:00')
      expect(result.runMetadata.runEndedAt).toBe('2024-01-15 11:00:00')
      expect(result.runMetadata.experimentName).toBe('MyExperiment')
      expect(result.runMetadata.fileName).toBe('uploaded.csv')
    })

    it('maps Content to task and standardQuantity (NTC, STD-1..5, Unkn)', () => {
      const csv = [
        'Well,Content,Sample,Cq,Starting Quantity (SQ)',
        'A1,Std-1,10k,12.5,10000',
        'A2,Std-2,1k,15.1,1000',
        'A3,Std-3,100,18.2,100',
        'A4,Std-4,10,21.0,10',
        'A5,Std-5,1,24.5,1',
        'A6,Neg Ctrl-6,Neg ctrl,,',
        'A7,Unkn,Sample1,20.0,5.5',
      ].join('\n')
      const result = parseBioradCsv(csv, 'test.csv')
      expect(result.wellResults.length).toBeGreaterThanOrEqual(7)

      const byWell = Object.fromEntries(result.wellResults.map((r) => [r.wellPosition, r]))
      expect(byWell['A01']?.task).toBe('STANDARD')
      expect(byWell['A01']?.standardQuantity).toBe(10000)
      expect(byWell['A02']?.task).toBe('STANDARD')
      expect(byWell['A02']?.standardQuantity).toBe(1000)
      expect(byWell['A06']?.task).toBe('NTC')
      expect(byWell['A06']?.standardQuantity).toBeNull()
      expect(byWell['A07']?.task).toBe('UNKNOWN')
      expect(byWell['A07']?.standardQuantity).toBeNull()
    })

    it('maps the Content values our own template writes (NTC, Std, Unk) and Std-01 style', () => {
      const csv = [
        'Well,Content,Sample,Cq,Starting Quantity (SQ)',
        'A1,NTC,,,',
        'A2,Std,,14.0,250',
        'A3,Std-01,,12.5,',
        'A4,Unk,S1,20.0,',
        'A5,Pos Ctrl,,18.0,',
      ].join('\n')
      const byWell = Object.fromEntries(parseBioradCsv(csv, 'test.csv').wellResults.map((r) => [r.wellPosition, r]))
      expect(byWell['A01']?.task).toBe('NTC')
      expect(byWell['A02']?.task).toBe('STANDARD')
      expect(byWell['A02']?.standardQuantity).toBe(250)
      expect(byWell['A03']?.task).toBe('STANDARD')
      expect(byWell['A03']?.standardQuantity).toBe(10000)
      expect(byWell['A04']?.task).toBe('UNKNOWN')
      expect(byWell['A05']?.task).toBe('UNKNOWN')
    })

    it('normalizes well position to A01 style', () => {
      const csv = [
        'Well,Content,Sample,Cq,Starting Quantity (SQ)',
        'a1,Std-1,,,',
        'H12,Neg ctrl,,,',
      ].join('\n')
      const result = parseBioradCsv(csv, 'test.csv')
      const positions = result.wellResults.map((r) => r.wellPosition)
      expect(positions).toContain('A01')
      expect(positions).toContain('H12')
    })

    it('includes wellResult fields: wellPosition, targetName, sampleBarcode, task, cq, quantity, standardQuantity, ampStatus', () => {
      const csv = [
        'Well,Content,Sample,Cq,Starting Quantity (SQ)',
        'A1,Unkn,BARCODE-001,20.5,3.2',
      ].join('\n')
      const result = parseBioradCsv(csv, 'test.csv')
      expect(result.wellResults.length).toBe(1)
      const row = result.wellResults[0]
      expect(row).toHaveProperty('wellPosition')
      expect(row).toHaveProperty('targetName')
      expect(row).toHaveProperty('sampleBarcode')
      expect(row).toHaveProperty('task')
      expect(row).toHaveProperty('cq')
      expect(row).toHaveProperty('quantity')
      expect(row).toHaveProperty('standardQuantity')
      expect(row).toHaveProperty('ampStatus')
      expect(row.sampleBarcode).toBe('BARCODE-001')
      expect(row.cq).toBe(20.5)
      expect(row.quantity).toBe(3.2)
    })
  })

  describe('parseQuantStudioXls', () => {
    function xlsBuffer(sheets: Record<string, unknown[][]>): Buffer {
      const wb = XLSX.utils.book_new()
      for (const [name, rows] of Object.entries(sheets)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
      }
      return XLSX.write(wb, { type: 'buffer', bookType: 'xls' }) as Buffer
    }

    it('reads Well Position, not the numeric Well column, in results and amplification sheets', async () => {
      const buffer = xlsBuffer({
        Results: [
          ['Well', 'Well Position', 'Sample Name', 'Task', 'CT'],
          [1, 'A1', 'S1', 'UNKNOWN', 22.1],
          [13, 'B1', 'S2', 'NTC', 'Undetermined'],
        ],
        'Amplification Data': [
          ['Well', 'Well Position', 'Cycle', 'Rn', 'Delta Rn'],
          [1, 'A1', 1, 0.5, 0.01],
        ],
      })

      const result = await parseQuantStudioXls(buffer, 'run.xls')

      expect(result.wellResults.map((r) => r.wellPosition)).toEqual(['A01', 'B01'])
      expect(result.amplificationData[0]?.wellPosition).toBe('A01')
    })
  })
})
