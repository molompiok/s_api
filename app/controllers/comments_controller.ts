import Comment from '#models/comment';
import type { HttpContext } from '@adonisjs/core/http';
import { createFiles } from './Utils/media/CreateFiles.js';
import { v4 } from 'uuid';
import { EXT_IMAGE, MEGA_OCTET } from './Utils/ctrlManager.js';
import db from '@adonisjs/lucid/services/db';
import { applyOrderBy } from './Utils/query.js';
import { updateFiles } from './Utils/media/UpdateFiles.js';
import { deleteFiles } from './Utils/media/DeleteFiles.js';
import Product from '#models/product';
import transmit from '@adonisjs/transmit/services/main';
import env from '#start/env';
import UserOrderItem from '#models/user_order_item';

export default class CommentsController {


    public async create_comment({ request, response, auth }: HttpContext) {
        const data = request.only(['title', 'description', 'rating', 'order_item_id']);
        const user = await auth.authenticate();
        const trx = await db.transaction();
        try {
            const requiredFields = {
                order_item_id: 'order_item_id is required',
                title: 'title is required',
                rating: 'rating is required'
            };

            for (const [field, message] of Object.entries(requiredFields)) {
                if (!data[field as keyof typeof requiredFields]) {
                    return response.badRequest(message);
                }
            }

            if (typeof data.title !== 'string' || data.title.length < 3 || data.title.length > 124) {
                return response.badRequest('Title must be between 3 and 124 characters');
            }

            if (data.description !== undefined && typeof data.description === 'string') {
                const len = data.description.trim().length;
                console.log({len, data});
                
                // if (len > 0 && (len < 5 || len > 512)) {
                //     return response.badRequest('Description must be either empty or between 5 and 512 characters');
                // }
            }

            const ratingNum = parseFloat(data.rating);
            if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
                return response.badRequest('Rating must be a number between 1 and 5');
            }


            const item = await UserOrderItem.find(data.order_item_id);
            console.log("🚀 ~ CommentsController ~ create_comment ~ item:", item)
            if (!item) return response.notFound('Order Item not found')

            if (user.id !== item.user_id) return response.unauthorized(`You can't comment this order item`)

            const existingComment = await Comment.query().where('order_item_id', data.order_item_id).first();

            if (existingComment) {
                return response.conflict('You have already commented on this product');
            }

            const comment_id = v4();

            const views = await createFiles({
                request,
                column_name: "views",
                table_id: comment_id,
                table_name: Comment.table,
                options: {
                    throwError: true,
                    compress: 'img',
                    min: 0,
                    max: 3,
                    extname: EXT_IMAGE,
                    maxSize: 12 * MEGA_OCTET,
                },
            });

            const newComment = await Comment.create({
                id: comment_id,
                user_id: user.id,
                order_item_id: item.id,
                product_id: item.product_id,
                title: data.title,
                description: data.description,
                rating: ratingNum,
                bind_name: item.bind_name,
                order_id: item.order_id,
                views,
            }, { client: trx });
            

            const product = await Product.query({ client: trx }).where('id', item.product_id).first();

            if (product) {
                const avgRating = await Comment.query({ client: trx })
                .where('product_id', item.product_id)
                .avg('rating as average')
                .count('* as comment_count')
                .first();

                product.rating = avgRating?.$extras.average ?? 0 
                product.comment_count = avgRating?.$extras.comment_count?? 0

                await product.save();
            }

            await trx.commit();

            transmit.broadcast(`store/${env.get('STORE_ID')}/comment`, { id: comment_id, event:'create'});
            
            return response.created(newComment);


        } catch (error) {
            trx.rollback()
            console.error('Error creating comment:', {
                message: error.message,
                stack: error.stack,
                order_item: data.order_item_id,
            });

            return response.internalServerError({
                success: false,
                error: 'An unexpected error occurred',
                ...(process.env.NODE_ENV === 'development' && { details: error.message })
            });
        }
    }

    public async get_comment({ request, response, auth }: HttpContext) {
        const { order_item_id } = request.qs();
        try {
            if (!order_item_id) {
                return response.badRequest('Order Item ID is required');
            }

            const user = await auth.authenticate();

            console.log("🚀 ~ CommentsController ~ get_comment ~ user:", user)

            const item = await UserOrderItem.find(order_item_id);
            console.log("🚀 ~ CommentsController ~ get_comment ~ item:", item)
            if (!item) return response.notFound('Order Item not found')
            // if (user.id !== item.user_id) return response.unauthorized(`You can't get this comment`)

            const comment = await Comment.query()
                .where('order_item_id', item.id)
                .first();

            return response.ok(comment || null);
        } catch (error) {
            console.error('Error getting comment:', error);
            return response.internalServerError({
                error: 'Server error occurred',
                ...(process.env.NODE_ENV === 'development' && { details: error.message })
            });
        }
    }

    public async get_comments({ request, response }: HttpContext) {
        const { order_by, page = 1, limit = 10, comment_id, product_id, with_users } = request.qs();
        try {
            if (comment_id) {
                const comment = await Comment.find(comment_id);
                if (!comment) throw new Error('Comment not found');
                return response.ok(comment);
            }

            let query = Comment.query().select('*');
            if (with_users == 'true' || with_users == true) {
                query = query.preload('user');
            }
            if (product_id) query = query.where('product_id', product_id);
            if (order_by) query = applyOrderBy(query, order_by, Comment.table);

            const commentsPaginate = await query.paginate(page, limit);
            return response.ok({ list: commentsPaginate.all(), meta: commentsPaginate.getMeta() });
        } catch (error) {
            console.error('Error getting comments:', error);
            return response.internalServerError({ error: 'Bad config or server error', details: error.message });
        }
    }

    public async update_comment({ request, response, auth }: HttpContext) {
        const user = await auth.authenticate();
        const { title, description, rating, comment_id } = request.only(['title', 'description', 'rating', 'comment_id']);
        const body = request.body();

        const trx = await db.transaction(); // 🔥 Démarrage transaction
        try {
            const comment = await Comment.find(comment_id);
            if (!comment) throw new Error('Comment not found');
            if (comment.user_id !== user.id) throw new Error('Unauthorized');

            comment.useTransaction(trx);
            comment.merge({ title, rating, description });

            for (const f of ['views'] as const) {
                if (!body[f]) continue;
                const urls = await updateFiles({
                    request,
                    table_name: Comment.table,
                    table_id: comment_id,
                    column_name: f,
                    lastUrls: comment[f],
                    newPseudoUrls: body[f],
                    options: {
                        throwError: true,
                        min: 1,
                        max: 1,
                        compress: 'img',
                        extname: EXT_IMAGE,
                        maxSize: 12 * MEGA_OCTET,
                    },
                });
                comment[f] = urls;
            }

            await comment.save();
            await trx.commit(); // ✅ Validation transaction
            transmit.broadcast(`store/${env.get('STORE_ID')}/comment`, { id: comment_id, event:'update'});

            return response.ok(comment);
        } catch (error) {
            await trx.rollback(); // ❌ Annulation transaction
            console.error('Error updating comment:', error);
            return response.internalServerError({ error: 'Bad config or server error', details: error.message });
        }
    }

    public async delete_comment({ request, response, auth }: HttpContext) {
        // const user = await auth.authenticate();
        const comment_id = request.param('id');

        if (!comment_id) throw new Error('Comment ID is required');

        const trx = await db.transaction(); // 🔥 Démarrage transaction
        try {
            const comment = await Comment.find(comment_id);
            if (!comment) throw new Error('Comment not found');
            // if (comment.user_id !== user.id) throw new Error('Unauthorized');

            
            await comment.useTransaction(trx).delete();
            await deleteFiles(comment_id);

            transmit.broadcast(`store/${env.get('STORE_ID')}/comment`, { id: comment_id, event:'delete'});
            
            
            const product = (comment.$isDeleted||null)  && await Product.query({ client: trx }).where('id', comment.product_id).first();
            if (product) {
                const avgRating = await Comment.query({ client: trx })
                .where('product_id', comment.product_id)
                .avg('rating as average')
                .count('* as comment_count')
                .first();
                
                product.rating = avgRating?.$extras.average ?? 0 
                product.comment_count = avgRating?.$extras.comment_count?? 0
                console.log({product:product.$attributes});
                
                await product.useTransaction(trx).save();
            }
            await trx.commit(); // ✅ Validation transaction
            return response.ok({ message: 'Comment deleted successfully' });
        } catch (error) {
            await trx.rollback(); // ❌ Annulation transaction
            console.error('Error deleting comment:', error);
            return response.internalServerError({ message: 'Comment not deleted', error: error.message });
        }
    }
}
