import CollectionDestinationPicker, {
  type DestinationCollection,
} from './CollectionDestinationPicker'
import type { Location } from '../lib/api/types'
import type { PlateCandidate } from '../lib/plate-filename-match'

export type MicronixPlate = DestinationCollection

interface MicronixPlatePickerProps {
  locations: Location[]
  plates: MicronixPlate[]
  value?: string
  onChange: (plateName: string) => void
  disabled?: boolean
  loading?: boolean
  suggestedPlates?: PlateCandidate[]
  allowCreateNew?: boolean
  suggestedNewPlateName?: string | null
}

export default function MicronixPlatePicker({
  plates,
  suggestedPlates,
  suggestedNewPlateName,
  ...rest
}: MicronixPlatePickerProps) {
  return (
    <CollectionDestinationPicker
      kind="plate"
      collections={plates}
      suggestedCollections={suggestedPlates}
      suggestedNewName={suggestedNewPlateName}
      {...rest}
    />
  )
}
