import Product from '#models/product'
import vine from '@vinejs/vine'

export const updateCartValidator = vine.compile(
    vine.object({
      bind: vine.any(),
      productId: vine.string().uuid().exists(async (_db, value) => {
          console.log("🚀 ~ productId:vine.string ~ value:", value)
          const product = await Product.find(value)
          console.log("🚀 ~ productId:vine.string ~ product:", product)
          return !!product
      }),
      mode: vine.enum(['increment', 'decrement', 'set', 'clear', 'max']),
      value: vine.number().min(0),
      ignoreStock: vine.boolean().optional()
    }).bail(false) 
  )


  export const UpdateCartMessage = {
    'bind.required': 'Le champ bind est requis.',
    'bind.object': 'Le champ bind doit être un objet valide.',

    'productId.required': 'Le produit est obligatoire.',
    'productId.uuid': 'L’ID du produit doit être un UUID valide.',
    'productId.exists': 'Le produit sélectionné n’existe pas.',

    'mode.required': 'Le mode d’action est requis.',
    'mode.enum': 'Le mode doit être l’un des suivants : increment, decrement, set, clear, max.',

    'value.number': 'La valeur doit être un nombre.',
    'value.min': 'La valeur ne peut pas être inférieure à 0.',

    'ignoreStock.boolean': 'ignoreStock doit être un booléen (true ou false).'
  }