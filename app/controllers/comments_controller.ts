import Comment from '#models/comment';
import type { HttpContext } from '@adonisjs/core/http'
import { createFiles } from './Utils/FileManager/CreateFiles.js';
import { v4 } from 'uuid';
import { EXT_SUPPORTED, MEGA_OCTET } from './Utils/ctrlManager.js';
import db from '@adonisjs/lucid/services/db';
import { applyOrderBy } from './Utils/query.js';
import { updateFiles } from './Utils/FileManager/UpdateFiles.js';
import { deleteFiles } from './Utils/FileManager/DeleteFiles.js';

export default class CommentsController {
    public async create_comment({ request, response , auth}: HttpContext) {

        const { title, description,  product_id ,rating} = request.only(['title','description', 'product_id', 'rating'])
        if (!product_id) {
            return response.badRequest({ message: 'product_id is required' })
        }
        const user  = await auth.authenticate()
        const comment_id = v4()
        try {
            const views = await createFiles({
                  request,
                  column_name: "views",
                  table_id: comment_id,
                  table_name: Comment.table,
                  options: {
                      throwError: true,
                      compress: 'img',
                      min: 1,
                      max: 1,
                      extname: EXT_SUPPORTED,
                      maxSize: 12 * MEGA_OCTET,
                  },
              });

            if (!title || !rating) {
                return response.badRequest({ message: 'information missing' })
            }
            const newComment = await Comment.create({
                user_id: user.id,
                product_id,
                title,
                description,
                rating: parseFloat(rating),
                views 
            })
            return response.created(newComment)
            
        } catch (error) {
            console.error('Error creating comment:', error)
            return response.internalServerError({ error: 'Bad config or server error' })
            
        }
      

    }
    public async get_comments({ request, response }: HttpContext) {
        const {order_by, page = 1, limit = 10, comment_id , product_id } = request.qs()
        try {
            if (comment_id) {
                const comment = await Comment.find(comment_id)
                if (!comment) {
                    return response.notFound({ message: 'Comment not found' })
                }
                return response.ok(comment)
            }
            let query = db.from(Comment.table).select('*')
    
            if (product_id) {
                 query  = query.where('product_id', product_id)
            }
             if (order_by) {
                        query = applyOrderBy(query, order_by, Comment.table)
                      }
            const commentsPaginate = await query.paginate(page, limit)
            return response.ok({ list: commentsPaginate.all(), meta:commentsPaginate.getMeta() })
        }
        catch (error) {
            console.error('Error getting comments:', error)
            return response.internalServerError({ error: 'Bad config or server error' })
        }
    }
    public async update_comment({ request, response , auth }: HttpContext) {

        const user = await auth.authenticate();
        const {  title, description ,rating , comment_id } = request.only(['title','description' , 'rating', 'comment_id']);
        const body = request.body();
        try {
          const comment = await Comment.find(comment_id);
            if (!comment) {
                return response.notFound({ message: 'Comment not found' })
            }
            if (comment.user_id !== user.id) {
                return response.unauthorized({ message: 'Unauthorized' })
            }
            comment.merge({  title , rating ,description })
              let urls = [];
            
                      for (const f of ['views'] as const) {
                          if (!body[f]) continue;
              
                          urls = await updateFiles({ // non synchrone
                              request,
                              table_name: "views",
                              table_id: comment_id,
                              column_name: f,
                              lastUrls: comment[f],
                              newPseudoUrls: body[f],
                              options: {
                                  throwError: true,
                                  min: 1,
                                  max: 1,
                                  compress: 'img',
                                  extname: EXT_SUPPORTED,
                                  maxSize: 12 * MEGA_OCTET,
                              },
                          });
                          comment[f] = urls;
                      }
                      await comment.save()
    
                      return response.ok(comment)
        } catch (error) {
            console.error('Error updating comment:', error)
            return response.internalServerError({ error: 'Bad config or server error' })
        }
    }
    public async delete({ request, response , auth}: HttpContext) {
        const user = await auth.authenticate();
        const comment_id = request.param('id')

        try {
            if(!comment_id){
                return response.badRequest({ message: 'Comment ID is required' })
            }
            const comment = await Comment.find(comment_id)
            if (!comment) {
                return response.notFound({ message: 'Comment not found' })
            }
            if (comment.user_id !== user.id) {
                return response.unauthorized({ message: 'Unauthorized' })
            }
            await comment.delete()
           await deleteFiles(comment_id)
            return response.ok({ message: 'Comment deleted successfully' })
        } catch (error) {
            console.error('Error in delete_store:', error)
            return response.internalServerError({ message: 'Store not deleted', error: error.message })
        }
    }

   
}